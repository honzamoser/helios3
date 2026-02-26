import { Vec3 } from "wgpu-matrix";

export class Light {
  position: [number, number, number];
  range: number;
  color: [number, number, number];
  intensity: number;

  constructor(
    position: [number, number, number],
    range: number,
    color: [number, number, number],
    intensity: number,
  ) {
    this.position = position;
    this.range = range;
    this.color = color;
    this.intensity = intensity;
  }

  /**
   * Creates a point light that emits in all directions from a position
   * @param position - World position of the light
   * @param range - Maximum distance the light reaches
   * @param color - RGB color of the light (0-1 range)
   * @param intensity - Light intensity multiplier
   */
  static createPoint(
    position: [number, number, number],
    range: number,
    color: [number, number, number],
    intensity: number = 1.0,
  ): Light {
    return new Light(position, range, color, intensity);
  }

  /**
   * Creates a directional light that emits parallel rays in a direction
   * @param direction - Direction the light is pointing (will be normalized in shader)
   * @param color - RGB color of the light (0-1 range)
   * @param intensity - Light intensity multiplier
   */
  static createDirectional(
    direction: [number, number, number],
    color: [number, number, number],
    intensity: number = 1.0,
  ): Light {
    // Use range <= 0 to indicate directional light
    return new Light(direction, 0, color, intensity);
  }
}
