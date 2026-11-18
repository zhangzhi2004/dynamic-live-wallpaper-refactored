using System;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;

static class Json { public static object Parse(string text) { return new JavaScriptSerializer().DeserializeObject(text); } }
static class Log { public static void Write(string text) { Console.WriteLine(text); } }
static class ThemeCatalogTests
{
    static int checks;
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
    static void Manifest(string root, string entries)
    {
        File.WriteAllText(Path.Combine(root,"themes.json"),"{\"themes\":["+entries+"]}");
        File.SetLastWriteTimeUtc(Path.Combine(root,"themes.json"),DateTime.UtcNow.AddSeconds(checks+1));
    }
    static string Entry(string id,string page) { return "{\"id\":\""+id+"\",\"status\":\"ready\",\"page\":\""+page+"\"}"; }
    static int Main(string[] args)
    {
        string scratch=Path.Combine(Path.GetTempPath(),"deskland-catalog-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(scratch);
        try
        {
            var root=Json.Parse(File.ReadAllText(Path.Combine(args[0],"themes.json"))) as Dictionary<string,object>;
            int count=0;
            foreach(object item in (System.Collections.IEnumerable)root["themes"])
            {
                var t=(Dictionary<string,object>)item;string id=(string)t["id"];
                Check(Themes.Available(args[0],id),"Unavailable catalog entry: "+id);count++;
            }
            Check(count==2,"Expected only meadow and beach");
            Check(!Themes.Available(args[0],"does-not-exist"),"Unknown ID allowed");
            File.WriteAllText(Path.Combine(scratch,"good.html"),"<canvas></canvas>");
            Manifest(scratch,Entry("valid","good.html")+","+Entry("escape","../outside.html")+","+Entry("missing","missing.html")+","+Entry("url","https://example.com/theme.html"));
            Check(Themes.Available(scratch,"valid"),"Local page rejected");
            Check(!Themes.Available(scratch,"escape"),"Traversal accepted");
            Check(!Themes.Available(scratch,"missing"),"Missing page accepted");
            Check(!Themes.Available(scratch,"url"),"External URL accepted");
            // A partial manifest edit must leave the last known good themes available.
            File.WriteAllText(Path.Combine(scratch,"themes.json"),"{");
            Check(Themes.Available(scratch,"valid"),"Partial write destroyed good cache");
            Manifest(scratch,Entry("other","good.html"));
            Check(Themes.Available(scratch,"other"),"Updated manifest not reloaded");
            Check(!Themes.Available(scratch,"valid"),"Removed ID stayed cached");
            Manifest(scratch,Entry("dup","good.html")+","+Entry("dup","good.html"));
            Check(Themes.Available(scratch,"other"),"Duplicate IDs replaced good cache");
            File.Delete(Path.Combine(scratch,"good.html"));
            Check(!Themes.Available(scratch,"other"),"Deleted page stayed available");
            Console.WriteLine("PASS "+checks+" catalog checks");return 0;
        }
        finally
        {
            // Only the explicitly created unique temporary directory is removed.
            if(Path.GetFullPath(scratch).StartsWith(Path.GetFullPath(Path.GetTempPath()),StringComparison.OrdinalIgnoreCase)) Directory.Delete(scratch,true);
        }
    }
}
