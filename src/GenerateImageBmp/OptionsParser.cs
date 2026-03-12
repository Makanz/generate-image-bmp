namespace GenerateImageBmp;

internal static class OptionsParser
{
    internal sealed record ParseResult(bool Success, bool IsHelp, AppOptions? Options, string? ErrorMessage);

    public static ParseResult TryParse(string[] args)
    {
        if (args.Any(a => string.Equals(a, "--help", StringComparison.OrdinalIgnoreCase) || string.Equals(a, "-h", StringComparison.OrdinalIgnoreCase)))
        {
            return new ParseResult(Success: true, IsHelp: true, Options: null, ErrorMessage: null);
        }

        var width = 800;
        var height = 480;
        var text = "BNP";
        var outputPath = "out.bmp";
        var fontFamily = "Segoe UI";
        var fontSizePx = 64f;
        var marginPx = 24;
        byte threshold = 200;
        var dither = false;
        var isDashboard = false;

        string? freeText = null;

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];

            if (arg == "--dither")
            {
                dither = true;
                continue;
            }

            if (arg == "--dashboard")
            {
                isDashboard = true;
                continue;
            }

            if (!arg.StartsWith("--", StringComparison.Ordinal))
            {
                freeText = freeText is null ? arg : freeText + " " + arg;
                continue;
            }

            string NextValue()
            {
                if (i + 1 >= args.Length)
                {
                    throw new ArgumentException($"Missing value for {arg}.");
                }
                i++;
                return args[i];
            }

            try
            {
                switch (arg)
                {
                    case "--width":
                        width = ParseInt(NextValue(), min: 1, name: "width");
                        break;
                    case "--height":
                        height = ParseInt(NextValue(), min: 1, name: "height");
                        break;
                    case "--text":
                        text = NextValue();
                        break;
                    case "--out":
                        outputPath = NextValue();
                        break;
                    case "--font":
                        fontFamily = NextValue();
                        break;
                    case "--fontSize":
                        fontSizePx = ParseFloat(NextValue(), min: 1, name: "fontSize");
                        break;
                    case "--margin":
                        marginPx = ParseInt(NextValue(), min: 0, name: "margin");
                        break;
                    case "--threshold":
                        threshold = ParseByte(NextValue(), name: "threshold");
                        break;
                    default:
                        return new ParseResult(false, false, null, $"Unknown argument: {arg}");
                }
            }
            catch (Exception ex)
            {
                return new ParseResult(false, false, null, ex.Message);
            }
        }

        if (!string.IsNullOrWhiteSpace(freeText) && (args.All(a => !string.Equals(a, "--text", StringComparison.Ordinal))))
        {
            text = freeText;
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            return new ParseResult(false, false, null, "Text must not be empty.");
        }

        var options = new AppOptions(
            Width: width,
            Height: height,
            Text: text,
            OutputPath: outputPath,
            FontFamily: fontFamily,
            FontSizePx: fontSizePx,
            MarginPx: marginPx,
            Threshold: threshold,
            Dither: dither,
            IsDashboard: isDashboard);

        return new ParseResult(true, false, options, null);
    }

    public static string GetHelpText() =>
        "GenerateImageBmp - generates a 1-bit BMP with black text\n" +
        "\n" +
        "Usage:\n" +
        "  GenerateImageBmp [options] [free text]\n" +
        "  GenerateImageBmp --dashboard [options]\n" +
        "\n" +
        "Options:\n" +
        "  --text <string>       Text to render (default: BNP)\n" +
        "  --out <path>          Output BMP path (default: out.bmp)\n" +
        "  --width <int>         Image width (default: 800)\n" +
        "  --height <int>        Image height (default: 480)\n" +
        "  --font <string>       Font family (default: Segoe UI)\n" +
        "  --fontSize <float>    Font size in pixels (default: 64)\n" +
        "  --margin <int>        Margin in pixels (default: 24)\n" +
        "  --threshold <0-255>   Threshold (default: 200)\n" +
        "  --dither              Enable Floyd-Steinberg dithering\n" +
        "  --dashboard           Render dashboard with components\n" +
        "  -h|--help             Show help\n" +
        "\n" +
        "Examples:\n" +
        "  GenerateImageBmp --text \"BNP\" --out bnp.bmp\n" +
        "  GenerateImageBmp \"Hello world\" --out hello.bmp\n" +
        "  GenerateImageBmp --dashboard --out dashboard.bmp\n";

    private static int ParseInt(string s, int min, string name)
    {
        if (!int.TryParse(s, out var value) || value < min)
        {
            throw new ArgumentException($"Invalid {name}: {s}");
        }
        return value;
    }

    private static float ParseFloat(string s, float min, string name)
    {
        if (!float.TryParse(s, out var value) || value < min)
        {
            throw new ArgumentException($"Invalid {name}: {s}");
        }
        return value;
    }

    private static byte ParseByte(string s, string name)
    {
        if (!byte.TryParse(s, out var value))
        {
            throw new ArgumentException($"Invalid {name}: {s}");
        }
        return value;
    }
}
