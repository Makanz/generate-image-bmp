using GenerateImageBmp;

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
    var mono = TextToMonochromeRenderer.Render(options);
    Bmp1Writer.WriteFile(options.OutputPath, mono);
    Console.WriteLine($"Wrote {options.OutputPath} ({mono.Width}x{mono.Height}, 1-bit BMP).");
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex.Message);
    Environment.ExitCode = 1;
}
