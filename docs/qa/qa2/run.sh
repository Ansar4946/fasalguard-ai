#!/bin/sh
S="$1"; shift
set -a; . "$S/qa2.env"; set +a
export QA2_SPEECH_WAV="$S/speech-en.wav" QA2_SILENCE_WAV="$S/silence.wav"
exec "$@"
