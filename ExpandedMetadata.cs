using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using SwarmUI.Text2Image;
using SwarmUI.Accounts;
using Newtonsoft.Json.Linq;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Builder;

namespace ExpandedMetadata;

public class ExpandedMetadata : Extension
{
    public override void OnFirstInit()
    {
        ExtensionName = "ExpandedMetadata";
        ExtensionAuthor = "blu3n";
        Version = "1.0.0";
        Description = "Adds extended metadata viewing for models with CivitAI/Arc En Ciel lookup support";
        License = "MIT";
        base.OnFirstInit();
    }

    public override void OnInit()
    {
        base.OnInit();

        // Register JavaScript file
        ScriptFiles.Add("Assets/expanded_metadata.js");
        OtherAssets.Add("Assets/expanded_metadata.js");

        // Register API endpoints
        API.RegisterAPICall(GetExpandedMetadata, true, Permissions.ViewImageHistory);
        API.RegisterAPICall(RefreshExpandedMetadata, true, Permissions.EditModelMetadata);
    }

    public override void OnPreLaunch()
    {
        base.OnPreLaunch();

        // Register custom route for serving images
        WebServer.WebApp.MapGet("/ExpandedMetadataImage/{*path}", ViewExpandedMetadataImage);
        Logs.Info("ExpandedMetadata: Registered /ExpandedMetadataImage route");
    }

    /// <summary>
    /// Gets or creates expanded metadata for a model
    /// </summary>
    public static async Task<JObject> GetExpandedMetadata(Session session, string model_path, string subtype = "Stable-Diffusion")
    {
        Logs.Info($"ExpandedMetadata: GetExpandedMetadata called for {model_path} with subtype {subtype}");

        if (!Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler))
        {
            Logs.Error($"ExpandedMetadata: Invalid sub-type: {subtype}");
            return new JObject() { ["error"] = "Invalid sub-type." };
        }

        // Normalize the model path (same as DescribeModel API does)
        model_path = model_path.Replace('\\', '/');
        while (model_path.Contains("//"))
        {
            model_path = model_path.Replace("//", "/");
        }
        model_path = model_path.TrimStart('/');

        Logs.Info($"ExpandedMetadata: Looking for model: {model_path}");
        T2IModel model = handler.GetModel(model_path);
        if (model == null)
        {
            Logs.Error($"ExpandedMetadata: Model not found: {model_path} in {subtype}");
            return new JObject() { ["error"] = $"Model not found: {model_path} in {subtype}" };
        }

        Logs.Info($"ExpandedMetadata: Model found: {model.Name}");

        string metadataPath = GetMetadataPath(model);

        // Check if metadata file already exists
        if (File.Exists(metadataPath))
        {
            try
            {
                string json = await File.ReadAllTextAsync(metadataPath);
                return JObject.Parse(json);
            }
            catch (Exception ex)
            {
                Logs.Error($"Failed to read existing metadata file: {ex.Message}");
            }
        }

        // Create new metadata
        return await CreateExpandedMetadata(model, metadataPath);
    }

    /// <summary>
    /// Forces a refresh of the expanded metadata (re-downloads from online sources)
    /// </summary>
    public static async Task<JObject> RefreshExpandedMetadata(Session session, string model_path, string subtype = "Stable-Diffusion")
    {
        if (!Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler))
        {
            return new JObject() { ["error"] = "Invalid sub-type." };
        }

        // Normalize the model path (same as DescribeModel API does)
        model_path = model_path.Replace('\\', '/');
        while (model_path.Contains("//"))
        {
            model_path = model_path.Replace("//", "/");
        }
        model_path = model_path.TrimStart('/');

        T2IModel model = handler.GetModel(model_path);
        if (model == null)
        {
            return new JObject() { ["error"] = $"Model not found: {model_path} in {subtype}" };
        }

        string metadataPath = GetMetadataPath(model);

        // Delete existing file if present
        if (File.Exists(metadataPath))
        {
            File.Delete(metadataPath);
        }

        return await CreateExpandedMetadata(model, metadataPath);
    }

    /// <summary>
    /// HTTP route handler for serving expanded metadata images
    /// </summary>
    public static async Task ViewExpandedMetadataImage(HttpContext context)
    {
        try
        {
            // Get the path from the route
            string path = context.Request.Path.ToString();
            if (path.StartsWith("/ExpandedMetadataImage/"))
            {
                path = path.Substring("/ExpandedMetadataImage/".Length);
            }

            // Validate and sanitize the path
            path = path.Replace('\\', '/').Trim('/');

            // Security check: ensure path doesn't try to escape the images directory
            if (path.Contains("..") || Path.IsPathRooted(path))
            {
                Logs.Warning($"ExpandedMetadata: Rejected invalid image path: {path}");
                context.Response.StatusCode = 400;
                await context.Response.WriteAsync("Invalid path");
                return;
            }

            // Build full path to image
            string rootDir = Path.GetDirectoryName(Path.GetFullPath(Program.DataDir));
            string imagesDir = Path.Combine(rootDir, "expanded_metadata", "images");
            string fullPath = Path.Combine(imagesDir, path);

            // Additional security check: ensure resolved path is within images directory
            string resolvedPath = Path.GetFullPath(fullPath);
            string allowedDir = Path.GetFullPath(imagesDir);
            if (!resolvedPath.StartsWith(allowedDir))
            {
                Logs.Warning($"ExpandedMetadata: Path traversal attempt blocked: {path}");
                context.Response.StatusCode = 403;
                await context.Response.WriteAsync("Forbidden");
                return;
            }

            if (!File.Exists(resolvedPath))
            {
                context.Response.StatusCode = 404;
                await context.Response.WriteAsync("File not found");
                return;
            }

            // Get mime type
            string ext = Path.GetExtension(resolvedPath).ToLower();
            string mimeType = ext switch
            {
                ".mp4" => "video/mp4",
                ".webm" => "video/webm",
                ".gif" => "image/gif",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                _ => "application/octet-stream"
            };

            // Read and serve the file
            byte[] imageData = await File.ReadAllBytesAsync(resolvedPath);

            // Set caching headers (cache for 1 year since content is immutable - hash-based paths)
            context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
            context.Response.Headers["ETag"] = $"\"{Path.GetFileName(path)}\"";

            context.Response.ContentType = mimeType;
            context.Response.StatusCode = 200;
            context.Response.ContentLength = imageData.Length;

            await context.Response.Body.WriteAsync(imageData);
            await context.Response.CompleteAsync();
        }
        catch (Exception ex)
        {
            Logs.Error($"ExpandedMetadata: Failed to serve image: {ex.Message}");
            context.Response.StatusCode = 500;
            await context.Response.WriteAsync("Internal server error");
        }
    }

    /// <summary>
    /// Gets the metadata file path for a model, searching by hash pattern
    /// </summary>
    private static string GetMetadataPath(T2IModel model)
    {
        // Use centralized expanded_metadata folder in SwarmUI root directory (one level up from Data)
        string rootDir = Path.GetDirectoryName(Path.GetFullPath(Program.DataDir));
        string metadataDir = Path.Combine(rootDir, "expanded_metadata", "metadata");
        Directory.CreateDirectory(metadataDir);

        // Get hash from model - this returns format "0x{64_char_hex}"
        string hash = model.Metadata?.Hash;

        // If not in metadata, try to generate tensor hash (AutoV3)
        if (string.IsNullOrEmpty(hash))
        {
            Logs.Info($"ExpandedMetadata: Hash not in metadata for {model.Name}, calculating...");
            hash = model.GetOrGenerateTensorHashSha256(updateCache: true, resave: false);
        }

        if (!string.IsNullOrEmpty(hash))
        {
            // SwarmUI hash format is "0x{full_hash}", extract the hex portion
            string hexHash = hash.StartsWith("0x") ? hash.Substring(2) : hash;

            // Get short hash (first 12 chars of hex) for filename
            string shortHash = hexHash.Length >= 12 ? hexHash.Substring(0, 12) : hexHash;
            Logs.Info($"ExpandedMetadata: Using hash 0x{shortHash}... for {model.Name}");

            // Search for existing file with pattern: <shorthash>.meta.*.json
            string[] existingFiles = Directory.GetFiles(metadataDir, $"{shortHash}.meta.*.json");
            if (existingFiles.Length > 0)
            {
                Logs.Info($"ExpandedMetadata: Found existing metadata file: {Path.GetFileName(existingFiles[0])}");
                return existingFiles[0];
            }

            // Generate new filename with short hash
            string modelName = Path.GetFileNameWithoutExtension(model.RawFilePath);
            string filename = $"{shortHash}.meta.{modelName}.json";
            Logs.Info($"ExpandedMetadata: Creating new metadata file: {filename}");
            return Path.Combine(metadataDir, filename);
        }

        // Fallback for models without hash (shouldn't normally happen)
        Logs.Warning($"ExpandedMetadata: Could not get hash for model {model.Name}, using name-based metadata file");
        string fallbackFilename = $"unknown.meta.{Path.GetFileNameWithoutExtension(model.RawFilePath)}.json";
        return Path.Combine(metadataDir, fallbackFilename);
    }

    /// <summary>
    /// Creates expanded metadata by extracting from file and performing online lookups
    /// </summary>
    private static async Task<JObject> CreateExpandedMetadata(T2IModel model, string outputPath)
    {
        JObject metadata = new JObject();

        try
        {
            // Basic file info
            metadata["file_name"] = Path.GetFileName(model.RawFilePath);
            metadata["file_path"] = model.RawFilePath;

            // Read safetensors metadata
            JObject fileMetadata = ReadSafetensorsMetadata(model.RawFilePath);
            metadata["file_metadata"] = fileMetadata;

            // Save initial metadata before hash calculation (as per user request)
            await SaveMetadataAsync(outputPath, metadata);

            // Calculate hashes
            var hashes = await CalculateHashesAsync(model);
            metadata["hashes"] = hashes;

            // Update file with hashes
            await SaveMetadataAsync(outputPath, metadata);

            // Perform online lookups
            string autov2Short = hashes["autov2_short"]?.ToString();
            string autov3Short = hashes["autov3_short"]?.ToString();
            string sha256Autov3 = hashes["sha256_autov3"]?.ToString();

            if (!string.IsNullOrEmpty(autov2Short))
            {
                // Try CivitAI lookup
                var civitaiData = await LookupCivitAI(autov2Short, autov3Short);
                if (civitaiData != null)
                {
                    metadata["civitai"] = civitaiData;

                    // Download images
                    await DownloadCivitAIImages(civitaiData, model, autov3Short);
                }
            }

            // Save final metadata
            await SaveMetadataAsync(outputPath, metadata);

            return metadata;
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to create expanded metadata: {ex.Message}\n{ex.StackTrace}");
            metadata["error"] = ex.Message;
            return metadata;
        }
    }

    /// <summary>
    /// Reads metadata from safetensors file header
    /// </summary>
    private static JObject ReadSafetensorsMetadata(string filePath)
    {
        try
        {
            using FileStream fs = File.OpenRead(filePath);
            using BinaryReader reader = new BinaryReader(fs);

            // Read 8-byte header length
            long headerLen = reader.ReadInt64();

            if (headerLen < 0 || headerLen > 100 * 1024 * 1024) // 100MB sanity check
            {
                return new JObject();
            }

            // Read JSON header
            byte[] headerBytes = reader.ReadBytes((int)headerLen);
            string headerJson = Encoding.UTF8.GetString(headerBytes);
            JObject header = JObject.Parse(headerJson);

            // Extract __metadata__ section
            if (header.ContainsKey("__metadata__"))
            {
                return (JObject)header["__metadata__"];
            }

            return new JObject();
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to read safetensors metadata: {ex.Message}");
            return new JObject();
        }
    }

    /// <summary>
    /// Calculates AutoV2 and AutoV3 hashes
    /// </summary>
    private static async Task<JObject> CalculateHashesAsync(T2IModel model)
    {
        JObject hashes = new JObject();

        try
        {
            // Calculate AutoV3 (tensor hash) - this is what SwarmUI already calculates
            string autov3Full = model.GetOrGenerateTensorHashSha256(updateCache: true, resave: false);
            if (autov3Full != null && autov3Full.StartsWith("0x"))
            {
                autov3Full = autov3Full.Substring(2);
            }

            // Calculate AutoV2 (full file hash)
            string autov2Full = await Task.Run(() =>
            {
                using FileStream fs = File.OpenRead(model.RawFilePath);
                using SHA256 sha256 = SHA256.Create();
                byte[] hash = sha256.ComputeHash(fs);
                return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            });

            hashes["sha256_autov2"] = autov2Full;
            hashes["sha256_autov3"] = autov3Full ?? "";
            hashes["autov2_short"] = autov2Full?.Substring(0, Math.Min(10, autov2Full.Length));
            hashes["autov3_short"] = autov3Full?.Substring(0, Math.Min(12, autov3Full?.Length ?? 0));
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to calculate hashes: {ex.Message}");
        }

        return hashes;
    }

    /// <summary>
    /// Lookup model on CivitAI
    /// </summary>
    private static async Task<JObject> LookupCivitAI(string autov2Short, string autov3Short)
    {
        using HttpClient client = new HttpClient();
        client.DefaultRequestHeaders.Add("User-Agent", "SwarmUI-ExpandedMetadata/1.0");

        try
        {
            // Try AutoV2 first
            string url = $"https://civitai.com/api/v1/model-versions/by-hash/{autov2Short}";
            var response = await client.GetAsync(url);

            if (!response.IsSuccessStatusCode && !string.IsNullOrEmpty(autov3Short))
            {
                // Try AutoV3
                url = $"https://civitai.com/api/v1/model-versions/by-hash/{autov3Short}";
                response = await client.GetAsync(url);
            }

            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                JObject data = JObject.Parse(json);

                // Fetch extended model info
                if (data["modelId"] != null)
                {
                    string modelUrl = $"https://civitai.com/api/v1/models/{data["modelId"]}";
                    var modelResponse = await client.GetAsync(modelUrl);
                    if (modelResponse.IsSuccessStatusCode)
                    {
                        string modelJson = await modelResponse.Content.ReadAsStringAsync();
                        data["model"] = JObject.Parse(modelJson);
                    }
                }

                return new JObject()
                {
                    ["source"] = "civitai",
                    ["data"] = data,
                    ["hash_used"] = response.RequestMessage.RequestUri.ToString().Contains(autov2Short) ? autov2Short : autov3Short,
                    ["model_url"] = $"https://civitai.com/models/{data["modelId"]}?modelVersionId={data["id"]}"
                };
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"CivitAI lookup failed: {ex.Message}");
        }

        return null;
    }

    /// <summary>
    /// Download images from CivitAI and update metadata with local URLs
    /// </summary>
    private static async Task DownloadCivitAIImages(JObject civitaiData, T2IModel model, string hash)
    {
        try
        {
            JArray images = (JArray)civitaiData["data"]["images"];
            if (images == null || images.Count == 0)
            {
                return;
            }

            // Use centralized expanded_metadata folder in SwarmUI root directory (one level up from Data)
            string rootDir = Path.GetDirectoryName(Path.GetFullPath(Program.DataDir));
            string imagesDir = Path.Combine(rootDir, "expanded_metadata", "images", hash);
            Directory.CreateDirectory(imagesDir);

            using HttpClient client = new HttpClient();
            client.DefaultRequestHeaders.Add("User-Agent", "SwarmUI-ExpandedMetadata/1.0");

            for (int i = 0; i < images.Count; i++)
            {
                JObject img = (JObject)images[i];
                string url = img["url"]?.ToString();
                if (string.IsNullOrEmpty(url))
                {
                    continue;
                }

                string ext = url.EndsWith(".mp4") ? ".mp4" :
                            url.EndsWith(".webm") ? ".webm" :
                            url.EndsWith(".gif") ? ".gif" : ".jpg";

                string filename = $"civitai_{i}{ext}";
                string localPath = Path.Combine(imagesDir, filename);

                try
                {
                    byte[] imageData = await client.GetByteArrayAsync(url);
                    await File.WriteAllBytesAsync(localPath, imageData);

                    // Store relative path for serving via API endpoint
                    // Path format: {hash}/civitai_{i}{ext}
                    img["local_path"] = $"{hash}/{filename}";

                    await Task.Delay(500); // Be nice to servers
                }
                catch (Exception ex)
                {
                    Logs.Warning($"Failed to download image {i}: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to download CivitAI images: {ex.Message}");
        }
    }

    /// <summary>
    /// Save metadata to file
    /// </summary>
    private static async Task SaveMetadataAsync(string path, JObject metadata)
    {
        string json = metadata.ToString(Newtonsoft.Json.Formatting.Indented);
        await File.WriteAllTextAsync(path, json);
    }
}
