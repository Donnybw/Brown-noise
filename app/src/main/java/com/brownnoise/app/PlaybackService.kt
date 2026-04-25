package com.brownnoise.app

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.cast.CastPlayer
import androidx.media3.cast.SessionAvailabilityListener
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.android.gms.cast.framework.CastContext

class PlaybackService : MediaSessionService() {

    private lateinit var mediaSession: MediaSession
    private lateinit var localPlayer: ExoPlayer
    private lateinit var castPlayer: CastPlayer
    private var currentPlayer: Player? = null

    private val mediaItem: MediaItem by lazy {
        MediaItem.fromUri("android.resource://${packageName}/${R.raw.brownnoise}")
    }

    override fun onCreate() {
        super.onCreate()

        localPlayer = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus= */ true
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
            .apply {
                repeatMode = Player.REPEAT_MODE_ONE
                setMediaItem(mediaItem)
                prepare()
            }

        castPlayer = CastPlayer(CastContext.getSharedInstance(this)).apply {
            setSessionAvailabilityListener(object : SessionAvailabilityListener {
                override fun onCastSessionAvailable() = switchToPlayer(castPlayer)
                override fun onCastSessionUnavailable() = switchToPlayer(localPlayer)
            })
        }

        currentPlayer = if (castPlayer.isCastSessionAvailable) castPlayer else localPlayer

        val activityIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        mediaSession = MediaSession.Builder(this, currentPlayer!!)
            .setSessionActivity(activityIntent)
            .build()
    }

    private fun switchToPlayer(newPlayer: Player) {
        if (currentPlayer == newPlayer) return
        val wasPlaying = currentPlayer?.isPlaying ?: false
        val position = currentPlayer?.currentPosition ?: 0L
        currentPlayer?.stop()

        if (newPlayer == castPlayer) {
            castPlayer.setMediaItem(mediaItem, position)
            castPlayer.prepare()
        } else {
            localPlayer.seekTo(position)
            localPlayer.prepare()
        }

        if (wasPlaying) newPlayer.play()
        currentPlayer = newPlayer
        mediaSession.player = newPlayer
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession = mediaSession

    override fun onDestroy() {
        mediaSession.release()
        localPlayer.release()
        castPlayer.setSessionAvailabilityListener(null)
        castPlayer.release()
        super.onDestroy()
    }
}
