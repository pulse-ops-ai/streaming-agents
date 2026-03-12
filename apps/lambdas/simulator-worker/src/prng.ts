import seedrandom from 'seedrandom'

export type PRNG = () => number

/** Create a seeded PRNG. Same seed always produces the same sequence. */
export function createPRNG(seed: string): PRNG {
  return seedrandom(seed)
}

/** Gaussian noise via Box-Muller transform using a seeded PRNG. */
export function gaussianNoise(prng: PRNG, mean: number, stddev: number): number {
  const u1 = prng()
  const u2 = prng()
  return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
