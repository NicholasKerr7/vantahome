import { performance } from 'node:perf_hooks';
import { resolveVoiceConversation } from './voiceConversation';
import { completedMemory, reliabilityContext, reliabilityNow as now } from './voiceReliabilityFixtures';

const benchmark = process.env.VANTA_VOICE_BENCHMARK === '1' ? test : test.skip;
const ITERATIONS = 150;
const WARM_UP = 25;

/** Report warmed resolver-only durations; this excludes speech recognition, audio, React and device execution. */
benchmark('reports local text resolver timings without a flaky performance threshold', () => {
  const context = reliabilityContext();
  const remembered = completedMemory(context, 'turn living room lights on');
  const pending = resolveVoiceConversation('turn lights off', context, null, now).memory;
  const cases = [
    { label: 'named-command', phrase: 'Could you turn the kitchen lights off?', memory: null, expected: 'command' },
    { label: 'ambiguous-command', phrase: 'Turn the lights off.', memory: null, expected: 'reply' },
    { label: 'room-correction', phrase: 'No, the family room.', memory: pending, expected: 'command' },
    { label: 'value-correction', phrase: 'Actually, make it 40 percent.', memory: remembered, expected: 'command' },
    { label: 'compound-rejection', phrase: 'Turn lights off and open the gate.', memory: null, expected: 'reply' },
  ];
  const samples = cases.map(({ label, phrase, memory, expected }) => {
    for (let index = 0; index < WARM_UP; index += 1) resolveVoiceConversation(phrase, context, memory, now + 1);
    const milliseconds: number[] = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
      const start = performance.now();
      const result = resolveVoiceConversation(phrase, context, memory, now + 1);
      milliseconds.push(performance.now() - start);
      expect(result.resolution.kind).toBe(expected);
    }
    milliseconds.sort((left, right) => left - right);
    return { label, iterations: ITERATIONS, p50Ms: Number(milliseconds[Math.ceil(ITERATIONS * 0.5) - 1].toFixed(3)),
      p95Ms: Number(milliseconds[Math.ceil(ITERATIONS * 0.95) - 1].toFixed(3)), maxMs: Number(milliseconds[ITERATIONS - 1].toFixed(3)) };
  });
  // Intentional opt-in diagnostic output: fixed labels and durations only, never user speech or account/device data.
  process.stdout.write(`${JSON.stringify({ benchmark: 'voice-text-resolver-only', node: process.version,
    platform: process.platform, architecture: process.arch, warmUp: WARM_UP, samples })}\n`);
});
