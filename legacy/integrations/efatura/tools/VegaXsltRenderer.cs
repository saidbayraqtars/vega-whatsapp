using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Xml;
using Saxon.Api;

internal static class VegaXsltRenderer
{
    private static string saxonDir;

    private static Assembly ResolveAssembly(object sender, ResolveEventArgs args)
    {
        string name = new AssemblyName(args.Name).Name + ".dll";
        string candidate = Path.Combine(saxonDir, name);
        return File.Exists(candidate) ? Assembly.LoadFrom(candidate) : null;
    }

    public static int Main(string[] args)
    {
        try
        {
            var values = Parse(args);
            string xml = Required(values, "xml");
            string xsl = Required(values, "xsl");
            string output = Required(values, "out");
            saxonDir = Required(values, "saxon-dir");
            AppDomain.CurrentDomain.AssemblyResolve += ResolveAssembly;
            return Transform(xml, xsl, output);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.ToString());
            return 1;
        }
    }

    // Ayrı metoda koymak önemli: AssemblyResolve kurulmadan Saxon tipleri JIT
    // tarafından çözülmeye çalışılmasın.
    private static int Transform(string xml, string xsl, string output)
    {
        Processor processor = new Processor();
        DocumentBuilder builder = processor.NewDocumentBuilder();
        builder.BaseUri = new Uri(Path.GetFullPath(xml));
        XdmNode input = builder.Build(new Uri(Path.GetFullPath(xml)));
        XsltCompiler compiler = processor.NewXsltCompiler();
        compiler.ErrorList = new List<Exception>();
        compiler.XmlResolver = new XmlUrlResolver();
        XsltTransformer transformer = compiler.Compile(new Uri(Path.GetFullPath(xsl))).Load();
        if (compiler.ErrorList.Count > 0) throw new Exception("XSLT derlenemedi: " + compiler.ErrorList[0]);
        transformer.InitialContextNode = input;
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output)));
        using (FileStream stream = new FileStream(output, FileMode.Create, FileAccess.Write, FileShare.Read))
        {
            Serializer serializer = new Serializer();
            serializer.SetOutputStream(stream);
            transformer.Run(serializer);
        }
        return 0;
    }

    private static Dictionary<string, string> Parse(string[] args)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i + 1 < args.Length; i += 2)
        {
            if (!args[i].StartsWith("--")) throw new ArgumentException("Gecersiz arguman: " + args[i]);
            result[args[i].Substring(2)] = args[i + 1];
        }
        return result;
    }

    private static string Required(Dictionary<string, string> values, string name)
    {
        string value;
        if (!values.TryGetValue(name, out value) || String.IsNullOrWhiteSpace(value))
            throw new ArgumentException("Eksik arguman: --" + name);
        return value;
    }
}
