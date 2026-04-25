package com.brownnoise.app

import android.content.ComponentName
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.mediarouter.app.MediaRouteButton
import com.brownnoise.app.ui.theme.Brown40
import com.brownnoise.app.ui.theme.Brown60
import com.brownnoise.app.ui.theme.Brown80
import com.brownnoise.app.ui.theme.BrownNoiseTheme
import com.brownnoise.app.ui.theme.OnSurface
import com.brownnoise.app.ui.theme.OnSurfaceVariant
import com.brownnoise.app.ui.theme.Surface
import com.brownnoise.app.ui.theme.SurfaceContainerHigh
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {

    private lateinit var controllerFuture: ListenableFuture<MediaController>
    private val _playerState = MutableStateFlow<PlayerUiState>(PlayerUiState())
    private val playerState: StateFlow<PlayerUiState> = _playerState

    private var controller: MediaController? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // Initialise Cast context eagerly so the cast button works
        try { CastContext.getSharedInstance(this, Executors.newSingleThreadExecutor()) } catch (_: Exception) {}

        val sessionToken = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(this, sessionToken).buildAsync()
        controllerFuture.addListener({
            controller = controllerFuture.get()
            controller?.addListener(playerListener)
            syncState()
        }, MoreExecutors.directExecutor())

        setContent {
            BrownNoiseTheme {
                val state by playerState.collectAsStateWithLifecycle()
                BrownNoiseScreen(
                    state = state,
                    onPlayPause = { controller?.let { c -> if (c.isPlaying) c.pause() else c.play() } }
                )
            }
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) = syncState()
        override fun onPlaybackStateChanged(playbackState: Int) = syncState()
    }

    private fun syncState() {
        val c = controller ?: return
        _playerState.value = PlayerUiState(isPlaying = c.isPlaying)
    }

    override fun onDestroy() {
        controller?.removeListener(playerListener)
        MediaController.releaseFuture(controllerFuture)
        super.onDestroy()
    }
}

data class PlayerUiState(val isPlaying: Boolean = false)

@Composable
fun BrownNoiseScreen(state: PlayerUiState, onPlayPause: () -> Unit) {
    var elapsedSeconds by remember { mutableLongStateOf(0L) }

    LaunchedEffect(state.isPlaying) {
        if (state.isPlaying) {
            while (isActive) {
                delay(1000)
                elapsedSeconds++
            }
        } else {
            elapsedSeconds = 0L
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Surface)
            .systemBarsPadding(),
        contentAlignment = Alignment.Center
    ) {
        // Subtle radial glow behind the button
        Box(
            modifier = Modifier
                .size(320.dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Brown40.copy(alpha = if (state.isPlaying) 0.18f else 0.05f),
                            Color.Transparent
                        )
                    )
                )
        )

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(40.dp)
        ) {
            // Title
            Text(
                text = "Brown Noise",
                style = MaterialTheme.typography.displayMedium,
                color = OnSurface,
                fontWeight = FontWeight.Light
            )

            // Timer
            Text(
                text = if (state.isPlaying) formatElapsed(elapsedSeconds) else "—",
                style = MaterialTheme.typography.titleMedium,
                color = OnSurfaceVariant,
                fontSize = 18.sp
            )

            // Play / Pause button
            PlayButton(isPlaying = state.isPlaying, onClick = onPlayPause)

            // Cast button
            CastButton()
        }
    }
}

@Composable
fun PlayButton(isPlaying: Boolean, onClick: () -> Unit) {
    val scale by animateFloatAsState(
        targetValue = if (isPlaying) 1f else 0.95f,
        animationSpec = tween(200),
        label = "button_scale"
    )

    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = if (isPlaying) Brown60 else SurfaceContainerHigh,
        tonalElevation = 0.dp,
        shadowElevation = if (isPlaying) 12.dp else 4.dp,
        modifier = Modifier
            .size(120.dp)
            .scale(scale)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) "Pause" else "Play",
                tint = if (isPlaying) Surface else Brown80,
                modifier = Modifier.size(52.dp)
            )
        }
    }
}

@Composable
fun CastButton() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        AndroidView(
            factory = { ctx ->
                MediaRouteButton(ctx).also { btn ->
                    CastButtonFactory.setUpMediaRouteButton(ctx, btn)
                }
            },
            modifier = Modifier.size(40.dp)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Cast",
            style = MaterialTheme.typography.labelSmall,
            color = OnSurfaceVariant
        )
    }
}

private fun formatElapsed(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
}
