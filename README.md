# Hold Relay 7

A small 3D browser game. On Varn-9, a rust-red desert moon, you are a trooper with the Frontier Line holding the Relay 7 comms uplink against the Skrell hive. The evac dropship lands in 8 minutes. Keep the uplink tower standing until it does.

**Play:** https://ryan-foo.github.io/relay-7/ (desktop with keyboard and mouse)

## Controls
- **WASD** move · **Mouse** aim · **Left click** fire · **R** reload · **G** grenade · **Shift** sprint · **M** mute
- **Tab / Space**: zoom out to the commander view (time slows to 25%) and back
- **1 2 3** select a squad (or click it) · **Right click** move · **H** hold · **C** charge · **F** follow me
- Call-ins in the commander view, paid with Command Points earned from kills:
  - **Z** Reinforce pod (15 CP, 25s cooldown): refills the selected squad
  - **X** Supply pod (20 CP, 30s): ammo and grenade crate plus a 45-second auto-turret where you click
  - **V** Air strike (30 CP, 40s): drag a line; a gunship strafes it after a 2-second warning. Friendly fire is on.

## The fight
Five waves over 8 minutes: Skitterer swarms, then Spitters (acid arcs that leave puddles), Burrowers (tunnel in and surface inside the walls), Carapace Brutes (armored in front, weak from behind and to air strikes), and finally all of them at once while the dropship descends. You get one respawn by drop pod. You lose if the tower falls or you go down twice.

Built with Three.js 0.160 (CDN import map), vanilla JS, no build step, procedural geometry, and WebAudio sound. Original setting.
