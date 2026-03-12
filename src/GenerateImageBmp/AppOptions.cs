namespace GenerateImageBmp;

internal sealed record AppOptions(
    int Width,
    int Height,
    string Text,
    string OutputPath,
    string FontFamily,
    float FontSizePx,
    int MarginPx,
    byte Threshold,
    bool Dither);
