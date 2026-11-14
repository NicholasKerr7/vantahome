#!/usr/bin/env node
/** Maintain the reviewed Voice 3.2.4 final-result and bounded iOS vocabulary adapter. */
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const ORIGINALS = {
  'ios/Voice/Voice.m': 'a46d9c38da080cd16b880e877601c1fe5f9caab312572289a531cfbfd8caf55e',
  'src/index.ts': 'a9dbab1f846f57c2ff6bf45a7b60bb27daa2135d5e291035fc854fcfab492cd6',
  'dist/index.js': '9ad01ba45eb032ff23657d1c568a2f4644cdfc847a660bca94a3b46dbb2bd420',
  'src/VoiceModuleTypes.ts': '855d91cd88aeb56c3ebb4a73f017abf51dfa851d70fa556380196a5439b871d2',
  'dist/VoiceModuleTypes.d.ts': '4d6f13486a39b9b729e2ea72090a13c278ba55d49fb0d0bee205dbdda70eb7cf',
};
const MARKER = '// VantaHome speech finalization adapter v1';

/** Reject upstream drift instead of silently applying a partially matching native modification. */
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Voice patch anchor changed; review the dependency.');
  return source.replace(before, after);
}

/** Apply only reviewed changes; already patched files must match the recorded final digest. */
function transformVoiceSource(filename, source) {
  let result = source;
  if (filename === 'ios/Voice/Voice.m') {
    result = replaceOnce(result, '@property (nonatomic) BOOL continuous;', `@property (nonatomic) BOOL continuous;
@property (nonatomic, copy) NSArray<NSString *> *contextualStrings;
@property (nonatomic) NSUInteger authorizationGeneration;`);
    result = replaceOnce(result, '    self.isTearingDown = YES;', '    self.authorizationGeneration += 1;\n    self.isTearingDown = YES;');
    result = replaceOnce(result, '    if (self.audioEngine.isRunning) {', '    if (self.audioEngine != nil) {');
    result = replaceOnce(result, '    self.recognitionRequest.shouldReportPartialResults = YES;', `    self.recognitionRequest.shouldReportPartialResults = YES;
    self.recognitionRequest.contextualStrings = self.contextualStrings ?: @[];`);
    result = replaceOnce(result, `            // session ID has changed, so ignore any capture results and error
            [self teardown];`, '            // An old result must never tear down a newer microphone owner.');
    result = replaceOnce(result, 'isFinal || self.recognitionTask.isCancelled || self.recognitionTask.isFinishing', 'isFinal || self.recognitionTask.isCancelled');
    result = replaceOnce(result, `    [self.recognitionTask finish];
    callback(@[@false]);`, `    // Stop audio input but keep listeners/task alive until the confirmed final result.
    [self.audioEngine stop];
    [self.recognitionRequest endAudio];
    [self.recognitionTask finish];
    callback(@[@false]);`);
    result = replaceOnce(result, `    [self.recognitionTask cancel];
    callback(@[@false]);`, `    self.authorizationGeneration += 1;
    [self.recognitionTask cancel];
    callback(@[@false]);`);
    result = replaceOnce(result, 'RCT_EXPORT_METHOD(startSpeech:(NSString*)localeStr callback:(RCTResponseSenderBlock)callback) {', `/** Validate property hints independently at the native boundary. */
- (NSArray<NSString *> *)boundedContextualStrings:(id)value {
    if (![value isKindOfClass:[NSArray class]]) return @[];
    NSMutableArray<NSString *> *phrases = [NSMutableArray new];
    NSMutableSet<NSString *> *seen = [NSMutableSet new];
    NSUInteger length = 0;
    for (id candidate in value) {
        if (![candidate isKindOfClass:[NSString class]]) continue;
        NSString *phrase = [candidate stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (phrase.length == 0 || phrase.length > 80 || [seen containsObject:phrase.lowercaseString]
            || [phrase rangeOfCharacterFromSet:[NSCharacterSet controlCharacterSet]].location != NSNotFound) continue;
        if (phrases.count >= 64 || length + phrase.length > 2048) break;
        [phrases addObject:phrase]; [seen addObject:phrase.lowercaseString]; length += phrase.length;
    }
    return phrases;
}

/** Share authorization while allowing older JS callers to use the original method. */
- (void)beginSpeech:(NSString *)localeStr options:(NSDictionary *)options callback:(RCTResponseSenderBlock)callback {`);
    result = replaceOnce(result, `        [self sendResult:RCTMakeError(@"Speech recognition already started!", nil, nil) :nil :nil :nil];
        return;`, `        callback(@[@"Speech recognition already started"]);
        return;`);
    const start = result.indexOf('- (void)beginSpeech:');
    const prefix = result.slice(0, start);
    let suffix = result.slice(start);
    suffix = replaceOnce(suffix, '    [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {', `    NSUInteger requestGeneration = ++self.authorizationGeneration;
    self.contextualStrings = [self boundedContextualStrings:options[@"contextualStrings"]];
    [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (requestGeneration != self.authorizationGeneration) return;`);
    suffix = replaceOnce(suffix, `    }];
    callback(@[@false]);`, `      });
    }];
    callback(@[@false]);`);
    result = prefix + suffix;
    result = replaceOnce(result, '- (dispatch_queue_t)methodQueue {', `RCT_EXPORT_METHOD(startSpeech:(NSString *)localeStr callback:(RCTResponseSenderBlock)callback) {
    [self beginSpeech:localeStr options:@{} callback:callback];
}

RCT_EXPORT_METHOD(startSpeechWithOptions:(NSString *)localeStr options:(NSDictionary *)options callback:(RCTResponseSenderBlock)callback) {
    [self beginSpeech:localeStr options:options ?: @{} callback:callback];
}

- (dispatch_queue_t)methodQueue {`);
  } else if (filename.endsWith('VoiceModuleTypes.ts') || filename.endsWith('VoiceModuleTypes.d.ts')) {
    result = replaceOnce(result, 'startSpeech: Function;', 'startSpeech: Function;\n  startSpeechWithOptions?: Function;');
  } else {
    result = replaceOnce(result, 'Voice.startSpeech(locale, callback);', `if (Voice.startSpeechWithOptions) { Voice.startSpeechWithOptions(locale, options, callback); }
        else { Voice.startSpeech(locale, callback); }`);
  }
  return `${MARKER}\n${result}`;
}

/** Verify exact source identity before writing any file; check mode never changes dependencies. */
function patchVoice(check = false, root = path.dirname(require.resolve('@react-native-voice/voice/package.json'))) {
  if (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version !== '3.2.4') throw new Error('Review Voice patch for this version.');
  const reviewed = require('./voice-recognition-patch-hashes.json');
  const changes = Object.entries(ORIGINALS).map(([filename, originalHash]) => {
    const location = path.join(root, filename);
    const source = readFileSync(location, 'utf8');
    const digest = createHash('sha256').update(source).digest('hex');
    if (digest === reviewed[filename]) return null;
    if (digest !== originalHash) throw new Error(`Unreviewed Voice source: ${filename}`);
    const next = transformVoiceSource(filename, source);
    if (createHash('sha256').update(next).digest('hex') !== reviewed[filename]) throw new Error(`Voice patch digest mismatch: ${filename}`);
    if (check) throw new Error(`Voice patch missing: ${filename}`);
    return { location, next };
  });
  for (const change of changes) if (change) writeFileSync(change.location, change.next);
}

if (require.main === module) { patchVoice(process.argv.includes('--check')); process.stdout.write('Voice recognition patch verified.\n'); }
module.exports = { transformVoiceSource, patchVoice, ORIGINALS };
