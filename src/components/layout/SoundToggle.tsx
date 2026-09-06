import { Volume2, VolumeX } from "lucide-react";
import { useSoundStore } from "../../store/soundStore";
import { play } from "../../audio/cues";

/** The one control for everything the parlour plays. Lives in the nav so it is
 *  reachable on every page — on a phone, Web Audio ignores the hardware silent
 *  switch in some browsers, and this is the only way out. */
export default function SoundToggle() {
  const muted = useSoundStore((s) => s.muted);
  const toggle = useSoundStore((s) => s.toggle);

  const handleClick = () => {
    const wasMuted = muted;
    toggle();
    // Turning it back on should be audible. The store has already flipped, so
    // this plays under the new setting; turning it off stays silent by itself.
    if (wasMuted) play("toggle");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`p-nav-sound ${muted ? "p-nav-sound-off" : ""}`}
      aria-label="Sound"
      aria-pressed={!muted}
    >
      {muted ? (
        <VolumeX className="w-4.5 h-4.5" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Volume2 className="w-4.5 h-4.5" strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  );
}
