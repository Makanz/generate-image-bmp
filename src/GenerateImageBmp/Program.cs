using System.Drawing;
using GenerateImageBmp;
using GenerateImageBmp.Components;

var parseResult = OptionsParser.TryParse(args);
if (parseResult.IsHelp)
{
    Console.WriteLine(OptionsParser.GetHelpText());
    return;
}

if (!parseResult.Success)
{
    Console.Error.WriteLine(parseResult.ErrorMessage);
    Console.Error.WriteLine();
    Console.Error.WriteLine("Run with --help for usage.");
    Environment.ExitCode = 2;
    return;
}

var options = parseResult.Options!;

try
{
    if (options.IsDashboard)
    {
        var canvas = new DashboardCanvas(options.Width, options.Height);

        canvas.Components.Add(new TextComponent("Inomhus", "23.5°C", new Point(20, 20), new Size(180, 60)));
        canvas.Components.Add(new TextComponent("Luftfuktighet", "67%", new Point(220, 20), new Size(180, 60)));

        canvas.Components.Add(new BarChartComponent(
            new List<BarData>
            {
                new("Mån", 45f),
                new("Tis", 62f),
                new("Ons", 38f),
                new("Tor", 55f),
                new("Fre", 71f),
                new("Lör", 22f),
                new("Sön", 15f)
            },
            new Point(20, 100),
            new Size(460, 200)));

        canvas.Components.Add(new ProgressGaugeComponent(75, "Batteri", new Point(500, 100), new Size(140, 140)));
        canvas.Components.Add(new ProgressGaugeComponent(42, "CPU", new Point(660, 100), new Size(140, 140)));
        canvas.Components.Add(new ProgressGaugeComponent(88, "Nät", new Point(500, 260), new Size(140, 140)));
        canvas.Components.Add(new ProgressGaugeComponent(12, "Ljud", new Point(660, 260), new Size(140, 140)));

        canvas.Components.Add(new TextComponent("Uppdaterad", "12:34", new Point(20, 420), new Size(200, 40)));

        canvas.RenderToFile(options.OutputPath, options.Threshold, options.Grayscale);
        var format = options.Grayscale ? "4-bit grayscale" : "1-bit";
        Console.WriteLine($"Wrote dashboard {options.OutputPath} ({options.Width}x{options.Height}, {format} BMP).");
    }
    else
    {
        var mono = TextToMonochromeRenderer.Render(options);
        Bmp1Writer.WriteFile(options.OutputPath, mono);
        Console.WriteLine($"Wrote {options.OutputPath} ({mono.Width}x{mono.Height}, 1-bit BMP).");
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex.Message);
    Environment.ExitCode = 1;
}
