using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

// Local theme catalog. Availability follows validated local pages, with no entitlement service.
// Cache by timestamp and length; keep the last good catalog during a partial edit.
static class Themes
{
    static readonly object Gate = new object();
    static Dictionary<string, string> pages = new Dictionary<string, string>(StringComparer.Ordinal);
    static string loadedPath;
    static DateTime loadedTime;
    static long loadedLength = -1;

    static void Reload(string pageDir)
    {
        string manifest = Path.GetFullPath(Path.Combine(pageDir, "themes.json"));
        var info = new FileInfo(manifest);
        if (loadedPath == manifest && info.Exists && loadedTime == info.LastWriteTimeUtc && loadedLength == info.Length) return;
        try
        {
            var root = Json.Parse(File.ReadAllText(manifest, Encoding.UTF8)) as Dictionary<string, object>;
            object list;
            if (root == null || !root.TryGetValue("themes", out list) || !(list is System.Collections.IEnumerable))
                throw new InvalidDataException("Missing themes array");
            string baseDir = Path.GetFullPath(pageDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            var next = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (object item in (System.Collections.IEnumerable)list)
            {
                var theme = item as Dictionary<string, object>;
                object id, page, status;
                if (theme == null || !theme.TryGetValue("id", out id) || !(id is string) ||
                    !theme.TryGetValue("page", out page) || !(page is string) ||
                    !theme.TryGetValue("status", out status) || (status as string) != "ready") continue;
                string relative = (string)page;
                if (Path.IsPathRooted(relative) || relative.IndexOfAny(new[] { '?', '#', ':', '\0' }) >= 0)
                {
                    Log.Write("跳过非本地主题页面：" + id);
                    continue;
                }
                string full = Path.GetFullPath(Path.Combine(baseDir, relative));
                if (!full.StartsWith(baseDir, StringComparison.OrdinalIgnoreCase) ||
                    !string.Equals(Path.GetExtension(full), ".html", StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                {
                    Log.Write("跳过无效的主题页面：" + id);
                    continue;
                }
                if (next.ContainsKey((string)id)) throw new InvalidDataException("Duplicate theme: " + id);
                next.Add((string)id, relative.Replace('\\', '/'));
            }
            if (next.Count == 0) throw new InvalidDataException("No runnable theme pages");
            pages = next;
            loadedPath = manifest;
            loadedTime = info.LastWriteTimeUtc;
            loadedLength = info.Length;
        }
        catch (Exception ex)
        {
            if (loadedPath != manifest) { pages.Clear(); loadedPath = null; }
            Log.Write("读取主题清单失败，保留上次有效清单：" + ex.Message);
        }
    }

    public static string PageFor(string pageDir, string id)
    {
        if (string.IsNullOrEmpty(id)) return null;
        lock (Gate)
        {
            Reload(pageDir);
            string page;
            return pages.TryGetValue(id, out page) && File.Exists(Path.Combine(pageDir, page)) ? page : null;
        }
    }

    public static bool Available(string pageDir, string id) { return PageFor(pageDir, id) != null; }
}
