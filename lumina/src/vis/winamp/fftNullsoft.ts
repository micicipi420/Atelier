/**
 * Nullsoft/Geiss FFT with Hann envelope and log10 "equalize" tilt — the
 * transform Winamp's own spectrum analyser uses, so bars look like Winamp and
 * not like the Web Audio API's dB-scaled AnalyserNode output.
 *
 * TypeScript port taken from Webamp (MIT, Copyright (c) 2015 Jordan Eldredge,
 * packages/webamp/js/components/FFTNullsoft.ts), itself ported from
 * WACUP/vis_classic FFTNullsoft/fft.cpp (BSD-3-Clause, Copyright 2005-2013
 * Nullsoft, Inc.). See NOTICE.md.
 */
export class FFT {
  private bitrevtable: number[];
  private envelope: Float32Array;
  private equalize: Float32Array;
  private temp1: Float32Array;
  private temp2: Float32Array;
  private cossintable: Float32Array[];

  private static readonly TWO_PI = 6.2831853;
  private static readonly HALF_PI = 1.5707963268;

  constructor(samplesIn = 1024, samplesOut = 512, envelopePower = 1.0) {
    const NFREQ = samplesOut * 2;
    this.bitrevtable = this.initBitRevTable(NFREQ);
    this.cossintable = this.initCosSinTable(NFREQ);
    this.envelope = this.initEnvelopeTable(samplesIn, envelopePower);
    this.equalize = this.initEqualizeTable(NFREQ);
    this.temp1 = new Float32Array(NFREQ);
    this.temp2 = new Float32Array(NFREQ);
  }

  private initEqualizeTable(NFREQ: number): Float32Array {
    const equalize = new Float32Array(NFREQ / 2);
    let bias = 0.04;
    for (let i = 0; i < NFREQ / 2; i++) {
      const invHalfNfreq = (9.0 - bias) / (NFREQ / 2);
      equalize[i] = Math.log10(1.0 + bias + (i + 1) * invHalfNfreq);
      bias /= 1.0025;
    }
    return equalize;
  }

  private initEnvelopeTable(samplesIn: number, power: number): Float32Array {
    const mult = (1.0 / samplesIn) * FFT.TWO_PI;
    const envelope = new Float32Array(samplesIn);
    for (let i = 0; i < samplesIn; i++) envelope[i] = Math.pow(0.5 + 0.5 * Math.sin(i * mult - FFT.HALF_PI), power);
    return envelope;
  }

  private initBitRevTable(NFREQ: number): number[] {
    const bitrevtable = new Array<number>(NFREQ);
    for (let i = 0; i < NFREQ; i++) bitrevtable[i] = i;
    for (let i = 0, j = 0; i < NFREQ; i++) {
      if (j > i) {
        const temp = bitrevtable[i]!;
        bitrevtable[i] = bitrevtable[j]!;
        bitrevtable[j] = temp;
      }
      let m = NFREQ >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }
    return bitrevtable;
  }

  private initCosSinTable(NFREQ: number): Float32Array[] {
    const cossintable: Float32Array[] = [];
    let dftsize = 2;
    while (dftsize <= NFREQ) {
      const theta = (-2.0 * Math.PI) / dftsize;
      cossintable.push(new Float32Array([Math.cos(theta), Math.sin(theta)]));
      dftsize <<= 1;
    }
    return cossintable;
  }

  /**
   * inWavedata: samplesIn time-domain samples; outSpectraldata: samplesOut
   * magnitudes from 0 Hz to sampleRate/4.
   */
  timeToFrequencyDomain(inWavedata: ArrayLike<number>, outSpectraldata: Float32Array): void {
    const temp1 = this.temp1;
    const temp2 = this.temp2;
    for (let i = 0; i < temp1.length; i++) {
      const idx = this.bitrevtable[i]!;
      temp1[i] = idx < inWavedata.length ? inWavedata[idx]! * this.envelope[idx]! : 0;
    }
    temp2.fill(0);
    const real = temp1;
    const imag = temp2;
    let dftsize = 2;
    let t = 0;
    while (dftsize <= temp1.length) {
      const wpr = this.cossintable[t]![0]!;
      const wpi = this.cossintable[t]![1]!;
      let wr = 1.0;
      let wi = 0.0;
      const hdftsize = dftsize >> 1;
      for (let m = 0; m < hdftsize; m += 1) {
        for (let i = m; i < temp1.length; i += dftsize) {
          const j = i + hdftsize;
          const tempr = wr * real[j]! - wi * imag[j]!;
          const tempi = wr * imag[j]! + wi * real[j]!;
          real[j] = real[i]! - tempr;
          imag[j] = imag[i]! - tempi;
          real[i] = real[i]! + tempr;
          imag[i] = imag[i]! + tempi;
        }
        const wtemp = wr;
        wr = wr * wpr - wi * wpi;
        wi = wi * wpr + wtemp * wpi;
      }
      dftsize <<= 1;
      ++t;
    }
    for (let i = 0; i < outSpectraldata.length; i++) {
      outSpectraldata[i] = Math.sqrt(real[i]! * real[i]! + imag[i]! * imag[i]!) * this.equalize[i]!;
    }
  }
}
