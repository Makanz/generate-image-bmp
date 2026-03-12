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

        canvas.Components.Add(new TextComponent("Temperatur", "23.5°C", new Point(20, 20)));
        canvas.Components.Add(new TextComponent("Luftfuktighet", "67%", new Point(20, 100)));

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
            new Point(20, 180),
            new Size(460, 150)));

        canvas.Components.Add(new ProgressGaugeComponent(75, "Batteri", new Point(520, 20), new Size(120, 140)));
        canvas.Components.Add(new ProgressGaugeComponent(42, "CPU", new Point(660, 20), new Size(120, 140)));
        canvas.Components.Add(new ProgressGaugeComponent(88, "Nät", new Point(520, 180), new Size(120, 140)));
        canvas.Components.Add(new ProgressGaugeComponent(12, "Ljud", new Point(660, 180), new Size(120, 140)));

        canvas.RenderToFile(options.OutputPath, options.Threshold);
        Console.WriteLine($"Wrote dashboard {options.OutputPath} ({options.Width}x{options.Height}, 1-bit BMP).");
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
