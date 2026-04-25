package com.brownnoise.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColors = darkColorScheme(
    primary = Brown80,
    onPrimary = Surface,
    primaryContainer = Brown40,
    onPrimaryContainer = Brown80,
    secondary = Brown60,
    onSecondary = Surface,
    background = Surface,
    onBackground = OnSurface,
    surface = Surface,
    onSurface = OnSurface,
    surfaceContainer = SurfaceContainer,
    surfaceContainerHigh = SurfaceContainerHigh,
    onSurfaceVariant = OnSurfaceVariant,
)

@Composable
fun BrownNoiseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColors,
        typography = Typography,
        content = content
    )
}
