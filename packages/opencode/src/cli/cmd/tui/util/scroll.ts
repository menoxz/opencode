import { MacOSScrollAccel, type ScrollAcceleration } from "@opentui/core"
import type { TuiConfig } from "@/cli/cmd/tui/config/tui"

export class CustomSpeedScroll implements ScrollAcceleration {
  constructor(private speed: number) {}

  tick(_now?: number): number {
    return this.speed
  }

  reset(): void {}
}

export class DynamicScrollAccel implements ScrollAcceleration {
  private lastTime = 0
  private multiplier = 1

  constructor(private baseSpeed: number) {}

  tick(now = Date.now()): number {
    const elapsed = now - this.lastTime
    this.lastTime = now

    if (elapsed < 80) {
      // Défilement très rapide : accélération importante
      this.multiplier = Math.min(this.multiplier + 2, 15)
    } else if (elapsed < 150) {
      // Défilement modéré : accélération douce
      this.multiplier = Math.min(this.multiplier + 1, 8)
    } else if (elapsed > 350) {
      // Temps mort long : réinitialisation
      this.multiplier = 1
    } else {
      // Décroissance progressive
      this.multiplier = Math.max(1, this.multiplier - 1)
    }

    return Math.round(this.baseSpeed * this.multiplier)
  }

  reset(): void {
    this.multiplier = 1
    this.lastTime = 0
  }
}

export function getScrollAcceleration(
  tuiConfig?: Pick<TuiConfig.Info, "scroll_acceleration" | "scroll_speed">,
): ScrollAcceleration {
  if (tuiConfig?.scroll_acceleration?.enabled) {
    return new MacOSScrollAccel()
  }
  if (tuiConfig?.scroll_speed !== undefined) {
    return new CustomSpeedScroll(tuiConfig.scroll_speed)
  }

  // Par défaut, nous utilisons désormais notre accélération dynamique (vitesse de base 3)
  // au lieu d'une vitesse linéaire plate et lente de 3.
  return new DynamicScrollAccel(3)
}
