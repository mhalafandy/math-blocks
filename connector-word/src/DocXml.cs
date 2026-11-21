using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// One read of a document's XML, split per equation picture (decision A, 0.1.168): every per-equation read of
    /// a request (list, verify, Repair's dry run, Check document) comes from it instead of one Range.WordOpenXML
    /// per equation (a 1500-equation thesis: minutes per read). Each picture's run is given as a small package
    /// with only the parts it refers to, the form the readers already parse (PictureXml, ObjectDataTagXml, the
    /// app's readEquationXml). An ID found on more than one picture is not served (the caller reads Word).
    /// No Word: tested in connector-word/tests.
    /// </summary>
    public sealed class DocXml
    {
        private static readonly XNamespace Pkg = "http://schemas.microsoft.com/office/2006/xmlPackage";
        private static readonly XNamespace W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        private static readonly XNamespace V = "urn:schemas-microsoft-com:vml";
        private static readonly XNamespace O = "urn:schemas-microsoft-com:office:office";
        private static readonly XNamespace R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private static readonly XNamespace WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
        private static readonly XNamespace Rels = "http://schemas.openxmlformats.org/package/2006/relationships";
        private static readonly Regex DataTag = new Regex("\"tag\":\"(mb1\\|[^\"|]+\\|[0-9A-Za-z]+)\"", RegexOptions.Compiled);

        private readonly Dictionary<string, string> _byTag = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly HashSet<string> _ambiguous = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Pictures found (runs holding an object, drawing or VML picture).</summary>
        public int Pictures { get; private set; }

        /// <summary>IDs served (found on exactly one picture).</summary>
        public int Served => _byTag.Count;

        /// <summary>The package for the one picture with this ID; null when none or several have it.</summary>
        public string PackageFor(string tag) => tag != null && _byTag.TryGetValue(tag, out var p) ? p : null;

        public static DocXml Parse(string flatOpc)
        {
            var d = new DocXml();
            var pkg = XDocument.Parse(flatOpc, LoadOptions.PreserveWhitespace);
            var parts = new Dictionary<string, XElement>(StringComparer.OrdinalIgnoreCase);
            foreach (var part in pkg.Root.Elements(Pkg + "part"))
            {
                var name = (string)part.Attribute(Pkg + "name");
                if (name != null) parts[name] = part;
            }
            if (!parts.TryGetValue("/word/document.xml", out var docPart)) return d;
            var rels = new Dictionary<string, XElement>(StringComparer.Ordinal);
            if (parts.TryGetValue("/word/_rels/document.xml.rels", out var relPart))
                foreach (var rel in relPart.Descendants(Rels + "Relationship"))
                {
                    var id = (string)rel.Attribute("Id");
                    if (id != null) rels[id] = rel;
                }
            var body = docPart.Descendants(W + "body").FirstOrDefault();
            if (body == null) return d;
            // The document's prefixes (w:, v:, o:, r:, wp:…): the readers' patterns expect Word's own spelling.
            var nsDecls = body.Parent.Attributes().Where(a => a.IsNamespaceDeclaration).ToList();
            foreach (var run in body.Descendants(W + "r"))
            {
                if (!run.Elements().Any(e => e.Name == W + "object" || e.Name == W + "drawing" || e.Name == W + "pict")) continue;
                d.Pictures++;
                var ids = run.Descendants().SelectMany(e => e.Attributes()).Where(a => a.Name.Namespace == R).Select(a => a.Value).Distinct().ToList();
                var tags = new HashSet<string>(StringComparer.Ordinal);
                var alt = run.Descendants(V + "shape").Select(e => (string)e.Attribute("alt")).FirstOrDefault(a => a != null)
                          ?? run.Descendants(WP + "docPr").Select(e => (string)e.Attribute("descr")).FirstOrDefault(a => a != null);
                var title = run.Descendants(WP + "docPr").Select(e => (string)e.Attribute("title")).FirstOrDefault(a => a != null)
                            ?? run.Descendants(V + "shape").Select(e => (string)e.Attribute("title")).FirstOrDefault(a => a != null);
                var t = EquationIdentity.ResolvePictureTag(title, alt, null, out _);
                if (t != null) tags.Add(t);
                // The ID in an object's own data (Word may drop an object's alt text).
                foreach (var ole in run.Descendants(O + "OLEObject"))
                {
                    var rid = (string)ole.Attribute(R + "id");
                    if (rid == null || !rels.TryGetValue(rid, out var rel)) continue;
                    if (!parts.TryGetValue(PartName((string)rel.Attribute("Target")), out var bin)) continue;
                    var dt = DataTagOf(bin);
                    if (dt != null) tags.Add(dt);
                }
                if (tags.Count == 0) continue;
                string package = null;
                foreach (var tag in tags)
                {
                    if (d._ambiguous.Contains(tag)) continue;
                    if (d._byTag.ContainsKey(tag))
                    {
                        d._byTag.Remove(tag);
                        d._ambiguous.Add(tag);
                        continue;
                    }
                    package = package ?? Package(run, ids, rels, parts, nsDecls);
                    d._byTag[tag] = package;
                }
            }
            return d;
        }

        private static string PartName(string target)
        {
            if (string.IsNullOrEmpty(target)) return "";
            if (target.StartsWith("/", StringComparison.Ordinal)) return target;
            return "/word/" + target;
        }

        private static string DataTagOf(XElement part)
        {
            try
            {
                var b64 = part.Element(Pkg + "binaryData")?.Value;
                if (string.IsNullOrEmpty(b64)) return null;
                var bytes = Convert.FromBase64String(Regex.Replace(b64, "\\s+", ""));
                var m = DataTag.Match(Encoding.ASCII.GetString(bytes));
                return m.Success ? m.Groups[1].Value : null;
            }
            catch (FormatException)
            {
                return null;
            }
        }

        /// <summary>The run in a package of its own: the document part, its relationships and the parts it refers to.</summary>
        private static string Package(XElement run, List<string> ids, Dictionary<string, XElement> rels, Dictionary<string, XElement> parts, List<XAttribute> nsDecls)
        {
            var sb = new StringBuilder();
            sb.Append("<pkg:package xmlns:pkg=\"").Append(Pkg.NamespaceName).Append("\">");
            sb.Append("<pkg:part pkg:name=\"/_rels/.rels\" pkg:contentType=\"application/vnd.openxmlformats-package.relationships+xml\"><pkg:xmlData><Relationships xmlns=\"").Append(Rels.NamespaceName)
              .Append("\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships></pkg:xmlData></pkg:part>");
            sb.Append("<pkg:part pkg:name=\"/word/document.xml\" pkg:contentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"><pkg:xmlData>");
            var doc = new XElement(W + "document", nsDecls.Select(a => new XAttribute(a)), new XElement(W + "body", new XElement(W + "p", new XElement(run))));
            sb.Append(doc.ToString(SaveOptions.DisableFormatting));
            sb.Append("</pkg:xmlData></pkg:part>");
            var used = ids.Where(rels.ContainsKey).ToList();
            if (used.Count > 0)
            {
                sb.Append("<pkg:part pkg:name=\"/word/_rels/document.xml.rels\" pkg:contentType=\"application/vnd.openxmlformats-package.relationships+xml\"><pkg:xmlData>");
                var relsEl = new XElement(Rels + "Relationships", used.Select(id => new XElement(rels[id])));
                sb.Append(relsEl.ToString(SaveOptions.DisableFormatting));
                sb.Append("</pkg:xmlData></pkg:part>");
                foreach (var id in used)
                {
                    var rel = rels[id];
                    if ((string)rel.Attribute("TargetMode") == "External") continue;
                    if (parts.TryGetValue(PartName((string)rel.Attribute("Target")), out var part))
                        sb.Append(part.ToString(SaveOptions.DisableFormatting));
                }
            }
            sb.Append("</pkg:package>");
            return sb.ToString();
        }
    }
}
