import test from 'node:test';
import assert from 'node:assert/strict';
import { GHOST_DEFINITIONS, LEVEL_CONFIGS } from './levels';
import {
  FACE_ATTACK_SLOT_ORDER,
  FIXED_STAGE_HEIGHT,
  FIXED_STAGE_WIDTH,
  GHOST_ALERT_DURATION_MS,
  GHOST_ALERT_MAX_ROWS,
  GhostVoiceScheduler,
  HIGH_TARGET_GHOST_VANISH_BEFORE_FACE_ATTACK,
  HIGH_TARGET_KILLS_THRESHOLD,
  KILL_CAM_BOSS_DURATION_SEC,
  KILL_CAM_REGULAR_DURATION_SEC,
  MAX_CONCURRENT_FACE_ATTACKS,
  MAX_GHOST_VANISH_BEFORE_FACE_ATTACK,
  MAX_PITCH_RAD,
  MAX_YAW_RAD,
  METEOR_MAX_COOLDOWN_SEC,
  METEOR_MIN_COOLDOWN_SEC,
  MIN_GENDERUWO_COOLDOWN_WAVES,
  MOBILE_MENU_UI_SCALE,
  VHS_MYSTICAL_PRESET,
  WIDE_LENS_DISTORTION,
  WILDLIFE_CALL_MAX_DELAY_SEC,
  WILDLIFE_CALL_MIN_DELAY_SEC,
  applyGhostDamage,
  applyGhostVanishOutcome,
  assignFaceAttackSlots,
  buildLevelGhostRoster,
  buildPacedSpawnDeck,
  buildSpawnTypeDeck,
  calculateAccuracy,
  checkLevelOutcome,
  clampCameraAngles,
  computeBossRespawnDelaySec,
  computeGhostFadeInOpacity,
  computeKillCamFocusAngles,
  computeKillCamState,
  computeLevelSoundscapeMix,
  computeLightningEnvelope,
  computeMenuUiScale,
  computeMeteorCooldownSec,
  computeNextWildlifeCallDelaySec,
  computeRandomizedWaveParams,
  computeScreenShake,
  computeThunderSyncParams,
  computeTouchDragAngles,
  computeWeatherState,
  formatFaceAttackAlert,
  formatGhostDefeatAlert,
  formatGhostSpawnAlert,
  formatGhostVanishAlert,
  getAmbienceTargetGain,
  getDifficultyModifiers,
  getFaceAttackSlotLayout,
  getFaceAttackSlotsForCount,
  getFaceAttackVanishThreshold,
  getGhostExplosionProfile,
  getIncomingFaceAttackSpawnSlot,
  isGhostVoiceAudioKey,
  isPhoneViewport,
  mapScreenNdcToWideLensNdc,
  pickOccasionalWildlifeCall,
  pruneExpiredGhostAlerts,
  pushGhostAlertQueue,
  resolveGhostSpawnPacing,
  resolveMousePointerVisibility,
  shuffleArray,
  sortPendingFaceAttackEntities,
} from './rules';

test('fixed stage dimensions are 2400x1080 and camera stays within 72 deg horizontal and +-15 deg vertical', () => {
  assert.equal(FIXED_STAGE_WIDTH, 2400);
  assert.equal(FIXED_STAGE_HEIGHT, 1080);
  assert.ok(Math.abs((MAX_YAW_RAD * 2 * 180) / Math.PI - 72) < 1e-6);
  assert.ok(Math.abs((MAX_PITCH_RAD * 180) / Math.PI - 15) < 1e-6);

  const clampedOver = clampCameraAngles(Math.PI, Math.PI / 2);
  assert.equal(clampedOver.yaw, MAX_YAW_RAD);
  assert.equal(clampedOver.pitch, MAX_PITCH_RAD);

  const clampedUnder = clampCameraAngles(-Math.PI, -Math.PI / 2);
  assert.equal(clampedUnder.yaw, -MAX_YAW_RAD);
  assert.equal(clampedUnder.pitch, -MAX_PITCH_RAD);

  const valid = clampCameraAngles(0.4, -0.2);
  assert.equal(valid.yaw, 0.4);
  assert.equal(valid.pitch, -0.2);
});

test('touchscreen drag delta maps swipe direction and sensitivity cleanly', () => {
  const dragLeft = computeTouchDragAngles(-100, 0, 2400, 1080, 1.0);
  assert.ok(dragLeft.yawDelta < 0); // swiping left pans camera right
  assert.equal(dragLeft.pitchDelta, 0);

  const dragFast = computeTouchDragAngles(-100, 50, 2400, 1080, 1.5);
  assert.ok(Math.abs(dragFast.yawDelta) > Math.abs(dragLeft.yawDelta));
  assert.ok(dragFast.pitchDelta > 0);
});

test('wide-lens distortion maps center to center and keeps corners inside [-1, 1]', () => {
  const center = mapScreenNdcToWideLensNdc(0, 0, WIDE_LENS_DISTORTION);
  assert.equal(center.x, 0);
  assert.equal(center.y, 0);

  const mid = mapScreenNdcToWideLensNdc(0.5, -0.25, WIDE_LENS_DISTORTION);
  assert.ok(mid.x > 0 && mid.x < 0.5);
  assert.ok(mid.y < 0 && mid.y > -0.25);

  const corner = mapScreenNdcToWideLensNdc(1, 1, WIDE_LENS_DISTORTION);
  assert.ok(Math.abs(corner.x - 1) < 1e-6);
  assert.ok(Math.abs(corner.y - 1) < 1e-6);
});

test('screen shake returns zero at rest and stays smooth & health-friendly at peak trauma', () => {
  const rest = computeScreenShake(0, 1.25);
  assert.deepEqual(rest, { yawOffset: 0, pitchOffset: 0, rollOffset: 0, fovOffset: 0 });

  const light = computeScreenShake(0.3, 0.42);
  const heavy = computeScreenShake(0.9, 0.42);
  assert.ok(Math.abs(heavy.yawOffset) > Math.abs(light.yawOffset) * 5);
  assert.ok(Math.abs(heavy.yawOffset) <= 0.015);
  assert.ok(Math.abs(heavy.pitchOffset) <= 0.015);
  assert.equal(heavy.rollOffset, 0);
  assert.ok(heavy.fovOffset > light.fovOffset && heavy.fovOffset <= 1.0);
});

test('all 5 ghost definitions match required HP values (1..5 shots)', () => {
  assert.equal(GHOST_DEFINITIONS.tuyul.hp, 1);
  assert.equal(GHOST_DEFINITIONS.pocong.hp, 2);
  assert.equal(GHOST_DEFINITIONS.kuntilanak.hp, 3);
  assert.equal(GHOST_DEFINITIONS.genderuwo.hp, 4);
  assert.equal(GHOST_DEFINITIONS.buto_ijo.hp, 5);
});

test('applyGhostDamage decrements HP cleanly and triggers kill exactly at 0', () => {
  let hp = GHOST_DEFINITIONS.kuntilanak.hp; // 3
  let res = applyGhostDamage(hp, 1);
  assert.deepEqual(res, { nextHp: 2, killed: false });
  hp = res.nextHp;

  res = applyGhostDamage(hp, 1);
  assert.deepEqual(res, { nextHp: 1, killed: false });
  hp = res.nextHp;

  res = applyGhostDamage(hp, 1);
  assert.deepEqual(res, { nextHp: 0, killed: true });

  // Extra damage on already defeated ghost does not re-trigger kill
  assert.deepEqual(applyGhostDamage(0, 1), { nextHp: 0, killed: false });
});

test('accuracy computes deterministically without score bonuses', () => {
  assert.equal(calculateAccuracy(0, 0), 0);
  assert.equal(calculateAccuracy(8, 10), 80);
  assert.equal(calculateAccuracy(12, 10), 100);
});

test('level outcome checks regular levels and level 5 dual boss + kill target victory', () => {
  assert.equal(
    checkLevelOutcome({
      kills: 9,
      targetKills: 10,
      timeLeft: 12,
      hasBoss: false,
      bossKills: 0,
      targetBossKills: 0,
    }),
    null,
  );
  assert.equal(
    checkLevelOutcome({
      kills: 10,
      targetKills: 10,
      timeLeft: 12,
      hasBoss: false,
      bossKills: 0,
      targetBossKills: 0,
    }),
    'victory',
  );
  assert.equal(
    checkLevelOutcome({
      kills: 7,
      targetKills: 10,
      timeLeft: 0,
      hasBoss: false,
      bossKills: 0,
      targetBossKills: 0,
    }),
    'defeat',
  );
  // Level 5: defeating Buto Ijo once or hitting kill target alone is NOT enough
  assert.equal(
    checkLevelOutcome({
      kills: 20,
      targetKills: 20,
      timeLeft: 25,
      hasBoss: true,
      bossKills: 2,
      targetBossKills: 3,
    }),
    null,
  );
  assert.equal(
    checkLevelOutcome({
      kills: 15,
      targetKills: 20,
      timeLeft: 25,
      hasBoss: true,
      bossKills: 3,
      targetBossKills: 3,
    }),
    null,
  );
  assert.equal(
    checkLevelOutcome({
      kills: 20,
      targetKills: 20,
      timeLeft: 10,
      hasBoss: true,
      bossKills: 3,
      targetBossKills: 3,
    }),
    'victory',
  );
  assert.equal(
    checkLevelOutcome({
      kills: 20,
      targetKills: 20,
      timeLeft: 0,
      hasBoss: true,
      bossKills: 2,
      targetBossKills: 3,
    }),
    'defeat',
  );
});

test('10 levels exist, scale difficulty progressively across timer & targetKills, and scare mode modifiers work', () => {
  assert.equal(LEVEL_CONFIGS.length, 10);
  const previewSet = new Set<string>();
  for (let i = 0; i < LEVEL_CONFIGS.length; i += 1) {
    const curr = LEVEL_CONFIGS[i];
    assert.equal(curr.id, i + 1);
    assert.ok(curr.allowedGhosts.length >= 2);
    assert.ok(curr.previewImage.startsWith('/assets/images/levels/'));
    previewSet.add(curr.previewImage);
    // Feasibility: timer leaves plenty of headroom (>= 3.5s per required kill)
    assert.ok(curr.durationSec / curr.targetKills >= 3.5, `Level ${curr.id} timer feasible for targetKills`);

    if (i > 0) {
      const prev = LEVEL_CONFIGS[i - 1];
      assert.ok(curr.targetKills > prev.targetKills, `Level ${curr.id} targetKills must exceed Level ${prev.id}`);
      assert.ok(curr.durationSec >= prev.durationSec, `Level ${curr.id} durationSec must accommodate higher targets`);
      assert.ok(curr.spawnIntervalSec < prev.spawnIntervalSec, `Level ${curr.id} spawns faster than Level ${prev.id}`);
      assert.ok(curr.ghostStaySec < prev.ghostStaySec, `Level ${curr.id} stay duration tightens vs Level ${prev.id}`);
      assert.ok(curr.ghostSpeedMul > prev.ghostSpeedMul, `Level ${curr.id} speed rises vs Level ${prev.id}`);
      assert.ok(curr.maxConcurrentGhosts >= prev.maxConcurrentGhosts);
    }
  }
  assert.equal(previewSet.size, 10, 'every level must have a distinct preview image');
  assert.equal(LEVEL_CONFIGS[4].hasBoss, true);
  assert.equal(LEVEL_CONFIGS[4].targetBossKills, 3);
  assert.equal(LEVEL_CONFIGS[9].hasBoss, true);
  assert.equal(LEVEL_CONFIGS[9].targetBossKills, 4);
  assert.ok(LEVEL_CONFIGS[9].targetKills >= 35);

  const santai = getDifficultyModifiers('santai');
  const horor = getDifficultyModifiers('horor');
  assert.ok(santai.ambientBoost > horor.ambientBoost);
  assert.ok(horor.speedScale > santai.speedScale);
});

test('spawn randomization deck & wave jitter preserve balance while varying order between runs', () => {
  const makeRng = (seedStart: number) => {
    let s = seedStart >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  };

  const allowed = LEVEL_CONFIGS[2].allowedGhosts;
  const deckA = buildSpawnTypeDeck(allowed, 3, makeRng(11));
  const deckB = buildSpawnTypeDeck(allowed, 3, makeRng(999));

  assert.equal(deckA.length, allowed.length * 3);
  assert.equal(deckB.length, allowed.length * 3);
  assert.notDeepEqual(deckA, deckB);

  for (const ghostType of allowed) {
    assert.equal(
      deckA.filter((t) => t === ghostType).length,
      3,
      `deckA must represent ${ghostType} evenly`,
    );
  }

  const shuffled = shuffleArray(['a', 'b', 'c', 'd'], makeRng(42));
  assert.deepEqual([...shuffled].sort(), ['a', 'b', 'c', 'd']);

  const mod = getDifficultyModifiers('petualangan');
  const waveLow = computeRandomizedWaveParams(2.0, 5.0, 1.2, mod, () => 0);
  const waveHigh = computeRandomizedWaveParams(2.0, 5.0, 1.2, mod, () => 0.999);
  assert.ok(waveLow.spawnIntervalSec >= 0.45 && waveLow.spawnIntervalSec < waveHigh.spawnIntervalSec);
  assert.ok(waveLow.stayDurationSec >= 2.2 && waveLow.stayDurationSec < waveHigh.stayDurationSec);
  assert.ok(waveLow.speedMul >= 0.65 && waveLow.speedMul < waveHigh.speedMul);
  assert.ok(waveLow.scaleJitter >= 0.94 && waveHigh.scaleJitter <= 1.06);
});

test('phone viewports use 3x menu UI scale while desktop and tablet remain 1x', () => {
  assert.equal(MOBILE_MENU_UI_SCALE, 3);

  // Smartphone portrait & landscape
  assert.equal(isPhoneViewport(390, 844), true);
  assert.equal(isPhoneViewport(844, 390), true);
  assert.equal(isPhoneViewport(915, 412), true);
  assert.equal(computeMenuUiScale(844, 390), 3);
  assert.equal(computeMenuUiScale(360, 800), 3);

  // Desktop & tablet
  assert.equal(isPhoneViewport(1440, 900), false);
  assert.equal(isPhoneViewport(1280, 720), false);
  assert.equal(isPhoneViewport(1024, 768), false);
  assert.equal(computeMenuUiScale(1440, 900), 1);
  assert.equal(computeMenuUiScale(1280, 720), 1);
});

test('ghost voice scheduler serializes spoken voices without overlapping and leaves SFX/music unrestricted', () => {
  assert.equal(isGhostVoiceAudioKey('ghosts/tuyul/voice'), true);
  assert.equal(isGhostVoiceAudioKey('ghosts/tuyul/taunt'), true);
  assert.equal(isGhostVoiceAudioKey('ghosts/pocong/voice'), true);
  assert.equal(isGhostVoiceAudioKey('ghosts/kuntilanak/scream'), true);
  assert.equal(isGhostVoiceAudioKey('ghosts/genderuwo/growl'), true);
  assert.equal(isGhostVoiceAudioKey('ghosts/buto-ijo/rage'), true);

  // Non-speech SFX and music bypass voice serialization
  assert.equal(isGhostVoiceAudioKey('ghosts/tuyul/hit'), false);
  assert.equal(isGhostVoiceAudioKey('ghosts/genderuwo/pebble'), false);
  assert.equal(isGhostVoiceAudioKey('weapon/shoot'), false);
  assert.equal(isGhostVoiceAudioKey('environment/thunder'), false);
  assert.equal(isGhostVoiceAudioKey('music/level-1'), false);

  const scheduler = new GhostVoiceScheduler<{ volume: number }>(250, 900);
  const d1 = scheduler.request('ghosts/tuyul/voice', 'ambient', 1000, { volume: 1.0 });
  assert.equal(d1.action, 'play_now');
  scheduler.markStarted(1.5, 1000); // busy until 1000 + 1500 + 250 = 2750

  // Ambient voice from another ghost while active must be dropped (no collision)
  const d2 = scheduler.request('ghosts/pocong/voice', 'ambient', 1600, { volume: 1.0 });
  assert.equal(d2.action, 'dropped');

  // Urgent taunt while active must queue for cleanly delayed playback after gap
  const d3 = scheduler.request('ghosts/kuntilanak/voice', 'urgent', 1700, { volume: 1.1 });
  assert.equal(d3.action, 'queued');
  assert.equal(d3.delayMs, 1050);

  // Too early -> pending remains unconsumed
  assert.equal(scheduler.consumePending(2600), null);
  // After voice + gap finishes -> pending plays cleanly
  const ready = scheduler.consumePending(2800);
  assert.ok(ready && ready.key === 'ghosts/kuntilanak/voice');
});

test('mystical horror VHS preset & deep dynamic weather cycle fog density and sync lightning/thunder', () => {
  assert.ok(VHS_MYSTICAL_PRESET.grainBase >= 0.025);
  assert.ok(VHS_MYSTICAL_PRESET.vignetteBase >= 0.25 && VHS_MYSTICAL_PRESET.vignetteBase <= 0.36);

  let maxDrizzle = 0;
  let minDrizzle = 1;
  let minFogMul = 99;
  let maxFogMul = 0;
  for (let t = 0; t <= 40; t += 1) {
    const w = computeWeatherState(t, false);
    maxDrizzle = Math.max(maxDrizzle, w.drizzleIntensity);
    minDrizzle = Math.min(minDrizzle, w.drizzleIntensity);
    minFogMul = Math.min(minFogMul, w.fogDensityMultiplier);
    maxFogMul = Math.max(maxFogMul, w.fogDensityMultiplier);
    assert.ok(w.mistOpacity >= 0.14 && w.mistOpacity <= 0.31);
    assert.ok(w.ambientMistOpacity >= 0.08 && w.ambientMistOpacity <= 0.21);
  }
  assert.ok(maxDrizzle > 0.45 && minDrizzle === 0, 'drizzle must wax and wane temporarily');
  assert.ok(minFogMul < 0.95 && maxFogMul > 1.35, 'fog density must surge and recede periodically');

  assert.equal(computeLightningEnvelope(-0.1), 0);
  assert.ok(computeLightningEnvelope(0.04) > 0.9);
  assert.ok(computeLightningEnvelope(0.19) > 0.7);
  assert.equal(computeLightningEnvelope(0.8), 0);

  const leftThunder = computeThunderSyncParams(-10, true);
  const rightThunder = computeThunderSyncParams(10, false);
  assert.ok(leftThunder.pan < -0.5 && rightThunder.pan > 0.5);
  assert.ok(leftThunder.volume > rightThunder.volume);
  assert.ok(leftThunder.delayMs < rightThunder.delayMs);
});

test('target pointer visibility is strictly limited to mouse input devices', () => {
  assert.equal(resolveMousePointerVisibility('move', 'mouse'), true);
  assert.equal(resolveMousePointerVisibility('down', 'mouse'), true);
  assert.equal(resolveMousePointerVisibility('move', 'touch'), false);
  assert.equal(resolveMousePointerVisibility('down', 'touch'), false);
  assert.equal(resolveMousePointerVisibility('move', 'pen'), false);
  assert.equal(resolveMousePointerVisibility('leave', 'mouse'), false);
  assert.equal(resolveMousePointerVisibility('reset', 'mouse'), false);
});

test('kill-cam slows down simulation time briefly, zooms FOV smoothly, and tracks defeated ghost angles', () => {
  const idle = computeKillCamState(0, KILL_CAM_REGULAR_DURATION_SEC, false);
  assert.equal(idle.active, false);
  assert.equal(idle.timeScale, 1);
  assert.equal(idle.fovOffset, 0);

  // Mid-plateau slow motion for regular kill
  const midReg = computeKillCamState(KILL_CAM_REGULAR_DURATION_SEC * 0.55, KILL_CAM_REGULAR_DURATION_SEC, false);
  assert.equal(midReg.active, true);
  assert.equal(midReg.envelope, 1);
  assert.ok(midReg.timeScale < 0.3 && midReg.timeScale >= 0.2);
  assert.ok(midReg.fovOffset < -5);
  assert.ok(midReg.vignetteBoost > 0.15);

  // Boss kill-cam lasts longer and delivers deeper slow-mo & stronger zoom
  assert.ok(KILL_CAM_BOSS_DURATION_SEC > KILL_CAM_REGULAR_DURATION_SEC);
  const midBoss = computeKillCamState(KILL_CAM_BOSS_DURATION_SEC * 0.55, KILL_CAM_BOSS_DURATION_SEC, true);
  assert.ok(midBoss.timeScale < midReg.timeScale);
  assert.ok(midBoss.fovOffset < midReg.fovOffset);

  // Tail release smoothly ramps back toward 1.0x
  const tail = computeKillCamState(KILL_CAM_REGULAR_DURATION_SEC * 0.05, KILL_CAM_REGULAR_DURATION_SEC, false);
  assert.ok(tail.timeScale > 0.85 && tail.timeScale < 1.0);
  assert.ok(Math.abs(tail.fovOffset) < 1.5);

  // Focus angle direction & arena bounds
  const leftGhost = computeKillCamFocusAngles({ x: -3.5, y: 2.2, z: -8.0 });
  const rightGhost = computeKillCamFocusAngles({ x: 3.5, y: 0.8, z: -8.0 });
  assert.ok(leftGhost.yaw > 0 && leftGhost.yaw <= MAX_YAW_RAD);
  assert.ok(rightGhost.yaw < 0 && rightGhost.yaw >= -MAX_YAW_RAD);
  assert.ok(leftGhost.pitch > 0 && rightGhost.pitch < 0);

  const extreme = computeKillCamFocusAngles({ x: 30, y: 20, z: -2 });
  assert.equal(extreme.yaw, -MAX_YAW_RAD);
  assert.equal(extreme.pitch, MAX_PITCH_RAD);
});

test('crickets ambience is attenuated softly and owl/wolf wildlife calls trigger occasionally in stereo', () => {
  const cricketGain = getAmbienceTargetGain('environment/crickets');
  const nightGain = getAmbienceTargetGain('environment/night-ambience');
  const windGain = getAmbienceTargetGain('environment/wind');
  assert.ok(cricketGain < nightGain && nightGain < windGain);
  assert.ok(cricketGain <= 0.16);

  const minDelay = computeNextWildlifeCallDelaySec(() => 0);
  const maxDelay = computeNextWildlifeCallDelaySec(() => 1);
  assert.equal(minDelay, WILDLIFE_CALL_MIN_DELAY_SEC);
  assert.equal(maxDelay, WILDLIFE_CALL_MAX_DELAY_SEC);
  assert.ok(minDelay >= 10, 'wildlife calls should only occur occasionally');

  const first = pickOccasionalWildlifeCall(null, () => 0.2);
  const second = pickOccasionalWildlifeCall('owl', () => 0.3);
  const third = pickOccasionalWildlifeCall('wolf', () => 0.3);
  assert.equal(first.kind, 'owl');
  assert.equal(first.key, 'environment/owl');
  assert.equal(second.kind, 'wolf');
  assert.equal(second.key, 'environment/wolf');
  assert.equal(third.kind, 'owl');
  assert.ok(Math.abs(first.pan) >= 0.28 && Math.abs(first.pan) <= 0.85);
  assert.ok(second.volume >= 0.5 && second.volume <= 0.85);
});

test('ghost alert queue maintains up to 3 upward-sliding rows, smooth spawn fade-in, and rare meteor interval', () => {
  assert.equal(GHOST_ALERT_MAX_ROWS, 3);

  const a1 = formatGhostSpawnAlert('pocong', false, 'banana');
  assert.ok(a1.title.includes('POCONG'));
  assert.ok(a1.detail.includes('PISANG'));

  const bossAlert = formatGhostSpawnAlert('buto_ijo', true, 'gate');
  assert.ok(bossAlert.title.includes('BUTO IJO'));

  let queue: Array<{ id: number; title: string; createdAtMs: number; durationMs: number }> = [];
  for (let i = 1; i <= 4; i += 1) {
    queue = pushGhostAlertQueue(
      queue,
      { id: i, title: `Hantu #${i}`, createdAtMs: i * 300, durationMs: GHOST_ALERT_DURATION_MS },
      i * 300,
    );
  }
  assert.equal(queue.length, 3);
  assert.deepEqual(
    queue.map((q) => q.id),
    [2, 3, 4],
  );

  const afterExpiry = pruneExpiredGhostAlerts(queue, 300 * 2 + GHOST_ALERT_DURATION_MS + 10);
  assert.deepEqual(
    afterExpiry.map((q) => q.id),
    [3, 4],
  );

  // Smooth cubic fade-in (0 -> 0.5 -> 1)
  assert.equal(computeGhostFadeInOpacity(0, 0.6), 0);
  assert.equal(computeGhostFadeInOpacity(0.3, 0.6), 0.5);
  assert.equal(computeGhostFadeInOpacity(0.6, 0.6), 1);
  assert.equal(computeGhostFadeInOpacity(1.5, 0.6), 1);

  // Rare falling meteor cooldown stays within 14s..32s
  assert.equal(computeMeteorCooldownSec(() => 0), METEOR_MIN_COOLDOWN_SEC);
  assert.equal(computeMeteorCooldownSec(() => 1), METEOR_MAX_COOLDOWN_SEC);
  assert.ok(METEOR_MIN_COOLDOWN_SEC >= 12);

  // Mystical explosion profile scales cleanly from hit -> kill -> boss kill
  const hitExp = getGhostExplosionProfile(false, false);
  const killExp = getGhostExplosionProfile(true, false);
  const bossExp = getGhostExplosionProfile(true, true);
  assert.ok(hitExp.smokeCount < killExp.smokeCount && killExp.smokeCount < bossExp.smokeCount);
  assert.ok(hitExp.wispCount < killExp.wispCount && killExp.wispCount < bossExp.wispCount);
  assert.ok(hitExp.ringCount === 1 && killExp.ringCount >= 3 && bossExp.ringCount >= 4);
  assert.ok(hitExp.lightIntensity < killExp.lightIntensity && killExp.lightIntensity < bossExp.lightIntensity);
});

test('Genderuwo and Buto Ijo spawn intensity is throttled while preserving regular ghost action', () => {
  const allowedWithGenderuwo = LEVEL_CONFIGS[2].allowedGhosts; // Level 3 includes genderuwo
  const pacedDeck = buildPacedSpawnDeck(allowedWithGenderuwo, 3, () => 0.42);
  const genderuwoCount = pacedDeck.filter((g) => g === 'genderuwo').length;
  assert.equal(genderuwoCount, 1);
  assert.ok(genderuwoCount / pacedDeck.length < 0.12, 'Genderuwo should be < 12% of paced deck');

  // Active Genderuwo, active Boss, or short wave cooldown substitutes a lighter ghost
  assert.notEqual(
    resolveGhostSpawnPacing('genderuwo', allowedWithGenderuwo, {
      activeGenderuwoCount: 1,
      hasActiveBoss: false,
      wavesSinceLastGenderuwo: 5,
    }),
    'genderuwo',
  );
  assert.notEqual(
    resolveGhostSpawnPacing('genderuwo', allowedWithGenderuwo, {
      activeGenderuwoCount: 0,
      hasActiveBoss: true,
      wavesSinceLastGenderuwo: 5,
    }),
    'genderuwo',
  );
  assert.notEqual(
    resolveGhostSpawnPacing('genderuwo', allowedWithGenderuwo, {
      activeGenderuwoCount: 0,
      hasActiveBoss: false,
      wavesSinceLastGenderuwo: MIN_GENDERUWO_COOLDOWN_WAVES - 1,
    }),
    'genderuwo',
  );
  assert.equal(
    resolveGhostSpawnPacing('genderuwo', allowedWithGenderuwo, {
      activeGenderuwoCount: 0,
      hasActiveBoss: false,
      wavesSinceLastGenderuwo: MIN_GENDERUWO_COOLDOWN_WAVES,
    }),
    'genderuwo',
  );

  // Boss Buto Ijo delays initial entrance & paces respawns well beyond 1.5s
  const bossInitial = computeBossRespawnDelaySec(true, 0, 3);
  const bossMid = computeBossRespawnDelaySec(false, 1, 3);
  const bossPostQuota = computeBossRespawnDelaySec(false, 3, 3);
  assert.ok(bossInitial >= 5.0);
  assert.ok(bossMid >= 8.0);
  assert.ok(bossPostQuota > bossMid);
});

test('looping ambient soundscapes (wind, distant gongs, rustling leaves) intensify with level horror theme', () => {
  const l1 = computeLevelSoundscapeMix(LEVEL_CONFIGS[0], 'petualangan');
  const l3 = computeLevelSoundscapeMix(LEVEL_CONFIGS[2], 'petualangan');
  const l5 = computeLevelSoundscapeMix(LEVEL_CONFIGS[4], 'petualangan');
  const l10 = computeLevelSoundscapeMix(LEVEL_CONFIGS[9], 'petualangan');

  for (const mix of [l1, l3, l5, l10]) {
    assert.ok(mix.windGain > 0);
    assert.ok(mix.distantGongsGain > 0);
    assert.ok(mix.rustlingLeavesGain > 0);
    assert.ok(mix.horrorIntensity >= 0.18 && mix.horrorIntensity <= 1.0);
  }

  assert.ok(l5.horrorIntensity > l1.horrorIntensity);
  assert.ok(l10.horrorIntensity >= l5.horrorIntensity);
  assert.ok(l5.windGain > l1.windGain);
  assert.ok(l5.distantGongsGain > l1.distantGongsGain);
  // Desa Mistis (Level 3) & Boss levels emphasize distant Javanese gongs
  assert.ok(l3.distantGongsGain > l1.distantGongsGain);

  const l5Santai = computeLevelSoundscapeMix(LEVEL_CONFIGS[4], 'santai');
  const l5Horor = computeLevelSoundscapeMix(LEVEL_CONFIGS[4], 'horor');
  assert.ok(l5Horor.windGain > l5Santai.windGain);
  assert.ok(l5Horor.distantGongsGain > l5Santai.distantGongsGain);
  assert.ok(l5Horor.rustlingLeavesGain > l5Santai.rustlingLeavesGain);
});

test('menu storm backdrop keeps continuous drizzle and frequent sky lightning active', async () => {
  const { computeLightningCooldownSec } = await import('./rules');
  for (let t = 0; t < 40; t += 1.5) {
    const w = computeWeatherState(t, true, true);
    assert.ok(w.drizzleIntensity >= 0.55 && w.drizzleIntensity <= 1.0);
    assert.ok(w.windSway > 0.1);
  }
  const minMenu = computeLightningCooldownSec(false, true, () => 0);
  const maxMenu = computeLightningCooldownSec(false, true, () => 1);
  assert.ok(minMenu >= 2.5 && maxMenu <= 5.5);
  assert.ok(maxMenu < computeLightningCooldownSec(false, false, () => 0.5));
});

test('ghost entrance animation curves progress from dark shadow silhouette & swirling smoke dissolve to full form', async () => {
  const { computeGhostEntranceState, getGhostEntranceProfile } = await import('./rules');

  const start = computeGhostEntranceState(0, 1.15);
  assert.equal(start.progress, 0);
  assert.equal(start.dissolveReveal, 0);
  assert.equal(start.shadowReveal, 0);
  assert.equal(start.edgeGlow, 0);

  // Early phase: smoke is dissolving the silhouette into view while color stays in dark shadow
  const early = computeGhostEntranceState(0.20, 1.15);
  assert.ok(early.dissolveReveal > 0.25);
  assert.equal(early.shadowReveal, 0);
  assert.ok(early.edgeGlow > 0.4);

  // Mid phase: both smoke dissolve & shadow color reveal rise with bright rim
  const mid = computeGhostEntranceState(0.60, 1.15);
  assert.ok(mid.dissolveReveal > early.dissolveReveal);
  assert.ok(mid.shadowReveal > 0.15 && mid.shadowReveal < 0.85);
  assert.ok(mid.edgeGlow > 0.7);

  // Completion: fully materialized, zero dissolve edge glow
  const done = computeGhostEntranceState(1.25, 1.15);
  assert.deepEqual(done, { progress: 1, dissolveReveal: 1, shadowReveal: 1, edgeGlow: 0 });

  const regular = getGhostEntranceProfile(false, 'tuyul');
  const heavy = getGhostEntranceProfile(false, 'genderuwo');
  const boss = getGhostEntranceProfile(true, 'buto_ijo');
  assert.ok(regular.smokeCount < heavy.smokeCount && heavy.smokeCount < boss.smokeCount);
  assert.ok(regular.wispCount < heavy.wispCount && heavy.wispCount < boss.wispCount);
});

test('each level builds an exact ghost roster matching targetKills and triggers close-up face attack after 3 vanishes alive', () => {
  assert.equal(MAX_GHOST_VANISH_BEFORE_FACE_ATTACK, 3);

  for (const lvl of LEVEL_CONFIGS) {
    const roster = buildLevelGhostRoster(lvl);
    assert.equal(roster.length, lvl.targetKills, `Level ${lvl.id} roster must match exact targetKills`);
    const bossEntities = roster.filter((e) => e.isBoss);
    assert.equal(
      bossEntities.length,
      lvl.hasBoss ? lvl.targetBossKills : 0,
      `Level ${lvl.id} boss entity count must match targetBossKills`,
    );
    const ids = new Set(roster.map((e) => e.entityId));
    assert.equal(ids.size, lvl.targetKills);
  }

  // Partially damaged ghost preserves remaining HP across vanishes and lunges into face_attack on 3rd vanish
  const [pocong] = buildLevelGhostRoster({
    targetKills: 1,
    allowedGhosts: ['pocong'],
    hasBoss: false,
    targetBossKills: 0,
  });
  assert.equal(pocong.hp, 2);

  // Vanish 1: unhit (hp stays 2)
  const v1 = applyGhostVanishOutcome(pocong, 2, 10, 1, () => 0.5);
  assert.equal(v1.triggerFaceAttack, false);
  assert.equal(pocong.hp, 2);
  assert.equal(pocong.vanishCount, 1);

  // Vanish 2: hit once (hp stays 1)
  const v2 = applyGhostVanishOutcome(pocong, 1, 18, 0, () => 0.5);
  assert.equal(v2.triggerFaceAttack, false);
  assert.equal(pocong.hp, 1);
  assert.equal(pocong.vanishCount, 2);

  // Vanish 3: still alive -> triggers close-up face jumpscare!
  const v3 = applyGhostVanishOutcome(pocong, 1, 25, 0, () => 0.5);
  assert.equal(v3.triggerFaceAttack, true);
  assert.equal(pocong.hp, 1);
  assert.equal(pocong.vanishCount, 3);

  const reappearAlert = formatGhostSpawnAlert('pocong', false, 'banana', 2);
  assert.ok(reappearAlert.title.includes('(2/3)'));
  const vanishAlert = formatGhostVanishAlert('pocong', 1, 3);
  assert.ok(vanishAlert.title.includes('3×'));
  const faceAlert = formatFaceAttackAlert('pocong', 1);
  assert.ok(faceAlert.title.includes('WAJAH POCONG'));
  const defeatAlert = formatGhostDefeatAlert('pocong', false, 4);
  assert.ok(defeatAlert.detail.includes('SISA TARGET: 4'));
});

test('face_attack slots dynamically shift: 1st center -> 2nd shifts 1st left & 2nd right -> 3rd shifts 2nd center & 3rd right', () => {
  assert.equal(MAX_CONCURRENT_FACE_ATTACKS, 3);
  assert.deepEqual(FACE_ATTACK_SLOT_ORDER, ['right', 'center', 'left']);

  assert.deepEqual(getFaceAttackSlotsForCount(0), []);
  assert.deepEqual(getFaceAttackSlotsForCount(1), ['center']);
  assert.deepEqual(getFaceAttackSlotsForCount(2), ['left', 'right']);
  assert.deepEqual(getFaceAttackSlotsForCount(3), ['left', 'center', 'right']);

  assert.equal(getIncomingFaceAttackSpawnSlot(0), 'center');
  assert.equal(getIncomingFaceAttackSpawnSlot(1), 'right');
  assert.equal(getIncomingFaceAttackSpawnSlot(2), 'right');

  // 1 ghost: appears in center
  assert.deepEqual(
    assignFaceAttackSlots([{ id: 10 }]).map((a) => ({ id: a.item.id, slot: a.slot })),
    [{ id: 10, slot: 'center' }],
  );

  // 2nd ghost joins: 1st shifts left, 2nd enters right
  assert.deepEqual(
    assignFaceAttackSlots([{ id: 10 }, { id: 20 }]).map((a) => ({ id: a.item.id, slot: a.slot })),
    [
      { id: 10, slot: 'left' },
      { id: 20, slot: 'right' },
    ],
  );

  // 3rd ghost joins: 1st stays left, 2nd shifts center, 3rd enters right
  assert.deepEqual(
    assignFaceAttackSlots([{ id: 10 }, { id: 20 }, { id: 30 }]).map((a) => ({ id: a.item.id, slot: a.slot })),
    [
      { id: 10, slot: 'left' },
      { id: 20, slot: 'center' },
      { id: 30, slot: 'right' },
    ],
  );

  const right = getFaceAttackSlotLayout('right');
  const center = getFaceAttackSlotLayout('center');
  const left = getFaceAttackSlotLayout('left');
  assert.ok(right.xOffset > 0 && left.xOffset < 0);
  assert.equal(right.xOffset, -left.xOffset);
  assert.equal(center.xOffset, 0);
  assert.ok(center.zDist < 1.0 && right.zDist < 1.0 && left.zDist < 1.0);
  assert.ok(center.renderOrder > right.renderOrder && center.renderOrder > left.renderOrder);
  assert.ok(center.scaleBoost >= right.scaleBoost);

  const sorted = sortPendingFaceAttackEntities([
    { entityId: 7, defeated: false },
    { entityId: 2, defeated: true },
    { entityId: 4, defeated: false },
    { entityId: 5, defeated: false },
  ]);
  assert.deepEqual(
    sorted.map((e) => e.entityId),
    [4, 5, 7],
  );
});

test('high-target levels (>= 20 targetKills, Levels 5-10) require 5 appearances/vanishes alive before face_attack', () => {
  assert.equal(HIGH_TARGET_KILLS_THRESHOLD, 20);
  assert.equal(HIGH_TARGET_GHOST_VANISH_BEFORE_FACE_ATTACK, 5);

  // Levels 1-4 -> 3; Levels 5-10 -> 5
  for (const lvl of LEVEL_CONFIGS) {
    const threshold = getFaceAttackVanishThreshold(lvl.targetKills);
    if (lvl.id <= 4) {
      assert.equal(threshold, 3, `Level ${lvl.id} (target ${lvl.targetKills}) should use 3-vanish threshold`);
    } else {
      assert.equal(threshold, 5, `Level ${lvl.id} (target ${lvl.targetKills}) should use 5-vanish threshold`);
    }
  }

  const highLevelThreshold = getFaceAttackVanishThreshold(LEVEL_CONFIGS[9].targetKills); // Level 10: 38 -> 5
  assert.equal(highLevelThreshold, 5);

  const [kunti] = buildLevelGhostRoster({
    targetKills: LEVEL_CONFIGS[9].targetKills,
    allowedGhosts: ['kuntilanak'],
    hasBoss: false,
    targetBossKills: 0,
  });

  // Vanishes 1..4 do NOT trigger face_attack on high-target levels
  for (let v = 1; v <= 4; v += 1) {
    const res = applyGhostVanishOutcome(kunti, 2, v * 10, 1, () => 0.5, highLevelThreshold);
    assert.equal(res.triggerFaceAttack, false);
    assert.equal(kunti.vanishCount, v);
  }

  // Vanish 5 triggers close-up face_attack!
  const v5 = applyGhostVanishOutcome(kunti, 2, 50, 0, () => 0.5, highLevelThreshold);
  assert.equal(v5.triggerFaceAttack, true);
  assert.equal(kunti.vanishCount, 5);

  const spawn5 = formatGhostSpawnAlert('kuntilanak', false, 'perched_tree', 5, 5);
  assert.ok(spawn5.title.includes('(5/5)'));
  const vanish4 = formatGhostVanishAlert('kuntilanak', 2, 4, 5);
  assert.ok(vanish4.title.includes('(4/5)'));
  const vanish5 = formatGhostVanishAlert('kuntilanak', 2, 5, 5);
  assert.ok(vanish5.title.includes('5×'));
});

test('face_attack spatial audio maps stereo pan to screen lanes and swells whisper/scream intensity as ghost approaches ears', async () => {
  const { getFaceAttackStereoPan, computeFaceAttackAudioIntensity } = await import('./rules');

  assert.equal(getFaceAttackStereoPan('center'), 0);
  assert.equal(getFaceAttackStereoPan('left'), -0.74);
  assert.equal(getFaceAttackStereoPan('right'), 0.74);

  // Continuous horizontal glide interpolation stays within [-0.82, 0.82]
  assert.equal(getFaceAttackStereoPan('center', 0), 0);
  assert.equal(getFaceAttackStereoPan('left', -0.56), -0.74);
  assert.equal(getFaceAttackStereoPan('right', 0.56), 0.74);
  const midShift = getFaceAttackStereoPan('left', -0.28);
  assert.ok(midShift < 0 && midShift > -0.74);
  assert.equal(getFaceAttackStereoPan('right', 2.0), 0.82);

  // Approaching ear intensity rises monotonically with ageSec and activeFaceCount
  const initial = computeFaceAttackAudioIntensity({ ageSec: 0, activeFaceCount: 1, isBoss: false });
  const midAge = computeFaceAttackAudioIntensity({ ageSec: 1.8, activeFaceCount: 1, isBoss: false });
  const peakAge = computeFaceAttackAudioIntensity({ ageSec: 4.5, activeFaceCount: 1, isBoss: false });

  assert.ok(initial.intensity < midAge.intensity && midAge.intensity < peakAge.intensity);
  assert.ok(initial.screamVolume < midAge.screamVolume && midAge.screamVolume < peakAge.screamVolume);
  assert.ok(initial.whisperGain < midAge.whisperGain && midAge.whisperGain < peakAge.whisperGain);
  assert.ok(initial.proximityFilterHz < midAge.proximityFilterHz && midAge.proximityFilterHz < peakAge.proximityFilterHz);
  assert.ok(initial.whisperFilterHz < midAge.whisperFilterHz && midAge.whisperFilterHz < peakAge.whisperFilterHz);
  assert.ok(initial.whisperLfoHz < peakAge.whisperLfoHz);

  // Crowd & Boss scaling intensify both scream & whispers further
  const twoFaces = computeFaceAttackAudioIntensity({ ageSec: 1.8, activeFaceCount: 2, isBoss: false });
  const threeFaces = computeFaceAttackAudioIntensity({ ageSec: 1.8, activeFaceCount: 3, isBoss: false });
  const bossFace = computeFaceAttackAudioIntensity({ ageSec: 1.8, activeFaceCount: 1, isBoss: true });

  assert.ok(twoFaces.intensity > midAge.intensity);
  assert.ok(threeFaces.intensity > twoFaces.intensity);
  assert.ok(threeFaces.whisperGain > twoFaces.whisperGain);
  assert.ok(bossFace.screamVolume > midAge.screamVolume);
});

test('computeHandSway produces subtle erratic camera tremor scaling with active ghosts and faceAttackActive', async () => {
  const { computeHandSway } = await import('./rules');

  const idle = computeHandSway({
    timeSec: 1.5,
    activeGhostCount: 0,
    faceAttackActive: false,
    activeFaceCount: 0,
    scareMode: 'petualangan',
  });
  assert.deepEqual(idle, { yawOffset: 0, pitchOffset: 0, rollOffset: 0, intensity: 0 });

  const oneGhost = computeHandSway({
    timeSec: 1.5,
    activeGhostCount: 1,
    faceAttackActive: false,
    activeFaceCount: 0,
    scareMode: 'petualangan',
  });
  const threeGhosts = computeHandSway({
    timeSec: 1.5,
    activeGhostCount: 3,
    faceAttackActive: false,
    activeFaceCount: 0,
    scareMode: 'petualangan',
  });
  const faceTriggered = computeHandSway({
    timeSec: 1.5,
    activeGhostCount: 3,
    faceAttackActive: true,
    activeFaceCount: 1,
    scareMode: 'petualangan',
  });
  const multiFaceHoror = computeHandSway({
    timeSec: 1.5,
    activeGhostCount: 3,
    faceAttackActive: true,
    activeFaceCount: 3,
    scareMode: 'horor',
  });

  assert.ok(oneGhost.intensity > 0);
  assert.ok(threeGhosts.intensity > oneGhost.intensity);
  assert.ok(faceTriggered.intensity > threeGhosts.intensity);
  assert.ok(multiFaceHoror.intensity > faceTriggered.intensity);

  // Subtle radian amplitudes so aiming remains fair even at peak horror terror
  assert.ok(Math.abs(multiFaceHoror.yawOffset) <= 0.012);
  assert.ok(Math.abs(multiFaceHoror.pitchOffset) <= 0.01);
  assert.ok(Math.abs(multiFaceHoror.rollOffset) <= 0.008);

  // Erratic variation over short time steps
  const tA = computeHandSway({ timeSec: 2.1, activeGhostCount: 2, faceAttackActive: true, activeFaceCount: 1 });
  const tB = computeHandSway({ timeSec: 2.45, activeGhostCount: 2, faceAttackActive: true, activeFaceCount: 1 });
  assert.notEqual(tA.yawOffset, tB.yawOffset);
  assert.notEqual(tA.pitchOffset, tB.pitchOffset);
});

test('quaternion gyro tracker works without calibration across portrait, landscape fullscreen, and gimbal lock', async () => {
  const {
    createGyroTrackerState,
    resetGyroTrackerOnOrientation,
    stepGyroTracker,
  } = await import('./rules');

  // 1. Portrait (orient = 0) at comfortable 55 deg hold: first frame initializes cleanly with zero jump
  let state = createGyroTrackerState(0);
  const f0 = stepGyroTracker(state, { alpha: 10, beta: 55, gamma: 0, screenOrientDeg: 0, nowMs: 100, sensitivity: 1.0 });
  state = f0.nextState;
  assert.equal(f0.didReset, true);
  assert.equal(f0.dYaw, 0);
  assert.equal(f0.dPitch, 0);

  // Tilting phone up (beta 55 -> 63) pitches camera upward (dPitch > 0)
  const fUp = stepGyroTracker(state, { alpha: 10, beta: 63, gamma: 0, screenOrientDeg: 0, nowMs: 250, sensitivity: 1.0 });
  state = fUp.nextState;
  assert.equal(fUp.didReset, false);
  assert.ok(fUp.dPitch > 0.05);
  assert.ok(Math.abs(fUp.dYaw) < 0.02);

  // Turning phone right (alpha decreases 10 -> 2, or tilting gamma right) pans right (dYaw < 0)
  const fRight = stepGyroTracker(state, { alpha: 2, beta: 63, gamma: 0, screenOrientDeg: 0, nowMs: 400, sensitivity: 1.0 });
  state = fRight.nextState;
  assert.ok(fRight.dYaw < -0.05);
  assert.ok(Math.abs(fRight.dPitch) < 0.02);

  // 2. Rotating device from Portrait (0 deg) to Landscape Fullscreen (90 deg): resets cleanly with zero jump
  state = resetGyroTrackerOnOrientation(state);
  const fOrientSnap = stepGyroTracker(state, { alpha: 10, beta: 0, gamma: -55, screenOrientDeg: 90, nowMs: 550, sensitivity: 1.0 });
  state = fOrientSnap.nextState;
  assert.equal(fOrientSnap.didReset, true);
  assert.equal(fOrientSnap.dYaw, 0);
  assert.equal(fOrientSnap.dPitch, 0);

  // Now in Landscape (90 deg): tilting screen upward (gamma -55 -> -63) STILL pitches camera UP (dPitch > 0)
  const fLandUp = stepGyroTracker(state, { alpha: 10, beta: 0, gamma: -63, screenOrientDeg: 90, nowMs: 700, sensitivity: 1.0 });
  state = fLandUp.nextState;
  assert.equal(fLandUp.didReset, false);
  assert.ok(fLandUp.dPitch > 0.05);
  assert.ok(Math.abs(fLandUp.dYaw) < 0.02);

  // Turning right in Landscape (alpha 10 -> 2) STILL pans right (dYaw < 0)
  const fLandRight = stepGyroTracker(state, { alpha: 2, beta: 0, gamma: -63, screenOrientDeg: 90, nowMs: 850, sensitivity: 1.0 });
  state = fLandRight.nextState;
  assert.ok(fLandRight.dYaw < -0.05);
  assert.ok(Math.abs(fLandRight.dPitch) < 0.02);

  // Landscape-secondary (270 deg): gamma +55 -> +63 tilts camera UP (dPitch > 0)
  const fLand270Init = stepGyroTracker(state, { alpha: 10, beta: 0, gamma: 55, screenOrientDeg: 270, nowMs: 1000, sensitivity: 1.0 });
  state = fLand270Init.nextState;
  assert.equal(fLand270Init.didReset, true);
  const fLand270Up = stepGyroTracker(state, { alpha: 10, beta: 0, gamma: 63, screenOrientDeg: 270, nowMs: 1150, sensitivity: 1.0 });
  assert.ok(fLand270Up.dPitch > 0.05);

  // 3. Gimbal lock continuity: Euler flip across gamma = +/-90 deg ((alpha=10, beta=30, gamma=89) -> (alpha=190, beta=150, gamma=-89))
  // represents only ~2 deg physical tilt, so tracker does NOT jump!
  let gimbalState = createGyroTrackerState(0);
  gimbalState = stepGyroTracker(gimbalState, { alpha: 10, beta: 30, gamma: 89, screenOrientDeg: 0, nowMs: 100, sensitivity: 1.0 }).nextState;
  const acrossGimbal = stepGyroTracker(gimbalState, { alpha: 190, beta: 150, gamma: -89, screenOrientDeg: 0, nowMs: 250, sensitivity: 1.0 });
  assert.equal(acrossGimbal.didReset, false);
  assert.ok(Math.abs(acrossGimbal.dYaw) < 0.08);
  assert.ok(Math.abs(acrossGimbal.dPitch) < 0.08);

  // 4. Sudden magnetometer/compass glitch (>28 deg in 1 frame) is rejected smoothly without jumping
  const glitch = stepGyroTracker(acrossGimbal.nextState, { alpha: 80, beta: 150, gamma: -89, screenOrientDeg: 0, nowMs: 266, sensitivity: 1.0 });
  assert.equal(glitch.didReset, true);
  assert.equal(glitch.dYaw, 0);
  assert.equal(glitch.dPitch, 0);
});

test('requestGyroPermission handles iOS granted/denied, Chromium prompt, and Android fallback', async () => {
  const { requestGyroPermission } = await import('./rules');
  const g = globalThis as unknown as { window?: { DeviceOrientationEvent?: unknown } };
  const prevWindow = g.window;

  try {
    g.window = { DeviceOrientationEvent: {} };
    assert.equal(await requestGyroPermission(), 'granted');

    g.window = { DeviceOrientationEvent: { requestPermission: async () => 'granted' } };
    assert.equal(await requestGyroPermission(), 'granted');

    g.window = { DeviceOrientationEvent: { requestPermission: async () => 'prompt' } };
    assert.equal(await requestGyroPermission(), 'granted');

    g.window = { DeviceOrientationEvent: { requestPermission: async () => 'denied' } };
    assert.equal(await requestGyroPermission(), 'denied');

    g.window = {
      DeviceOrientationEvent: {
        requestPermission: async () => {
          throw new Error('NotAllowedError');
        },
      },
    };
    assert.equal(await requestGyroPermission(), 'denied');

    g.window = {};
    assert.equal(await requestGyroPermission(), 'unsupported');
  } finally {
    if (prevWindow === undefined) {
      delete g.window;
    } else {
      g.window = prevWindow;
    }
  }
});

test('title subtitles contain all 22 lines and pickNextRandomSubtitleIndex avoids immediate repeats', async () => {
  const { TITLE_SUBTITLE_INTERVAL_MS, TITLE_SUBTITLES, pickNextRandomSubtitleIndex } = await import('./rules');
  assert.equal(TITLE_SUBTITLE_INTERVAL_MS, 9000);
  assert.equal(TITLE_SUBTITLES.length, 22);
  assert.equal(new Set(TITLE_SUBTITLES).size, 22);

  for (let current = 0; current < TITLE_SUBTITLES.length; current += 1) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const next = pickNextRandomSubtitleIndex(current, TITLE_SUBTITLES.length, () => r);
      assert.ok(next >= 0 && next < TITLE_SUBTITLES.length);
      assert.notEqual(next, current);
    }
  }
});

test('iOS Safari viewport, fullscreen fallback, pixelRatio, and safe-area helpers protect iPhone without affecting PC or Android', async () => {
  const {
    isIosDevice,
    supportsNativeElementFullscreen,
    getEffectiveViewportSize,
    computeRendererPixelRatio,
    computeMenuSafeAreaInsets,
  } = await import('./rules');

  // Platform detection
  assert.equal(
    isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 5, 'iPhone'),
    true,
  );
  assert.equal(
    isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5, 'MacIntel'),
    true,
  );
  assert.equal(
    isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36', 5, 'Linux armv8l'),
    false,
  );
  assert.equal(
    isIosDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36', 0, 'Win32'),
    false,
  );

  // Fullscreen capability check
  assert.equal(supportsNativeElementFullscreen({}), false);
  assert.equal(supportsNativeElementFullscreen(null), false);
  assert.equal(supportsNativeElementFullscreen({ requestFullscreen: async () => {} }), true);
  assert.equal(supportsNativeElementFullscreen({ webkitRequestFullscreen: async () => {} }), true);

  // visualViewport takes priority over stale 100vh/innerHeight on iOS Safari landscape
  assert.deepEqual(
    getEffectiveViewportSize({ innerWidth: 844, innerHeight: 390, visualWidth: 844, visualHeight: 326 }),
    { width: 844, height: 326 },
  );
  assert.deepEqual(
    getEffectiveViewportSize({ innerWidth: 1440, innerHeight: 900, visualWidth: null, visualHeight: null }),
    { width: 1440, height: 900 },
  );

  // Renderer pixel ratio
  assert.equal(computeRendererPixelRatio({ isSoftwareGl: false, isIos: true }), 0.75);
  assert.equal(computeRendererPixelRatio({ isSoftwareGl: false, isIos: false }), 1);
  assert.equal(computeRendererPixelRatio({ isSoftwareGl: true, isIos: true }), 0.5);

  // Safe area conversion clears Dynamic Island/Home Indicator when edge-to-edge, 0 on PC/Android
  assert.deepEqual(
    computeMenuSafeAreaInsets({ top: 0, right: 0, bottom: 0, left: 0 }, { width: 1440, height: 900 }, 0.6, 1),
    { top: 0, right: 0, bottom: 0, left: 0 },
  );
  const iphoneLandscapeSafe = computeMenuSafeAreaInsets(
    { top: 0, right: 54, bottom: 21, left: 54 },
    { width: 852, height: 393 },
    852 / 2400,
    3,
  );
  assert.equal(iphoneLandscapeSafe.left > 40, true);
  assert.equal(iphoneLandscapeSafe.right > 40, true);
  assert.equal(iphoneLandscapeSafe.bottom > 10, true);
});

test('all game assets follow uniform naming, exist in public/assets, and leave no orphan files', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { AUDIO_MANIFEST } = await import('./audio');

  const expectedImages: Record<keyof typeof GHOST_DEFINITIONS, string> = {
    tuyul: '/assets/images/ghosts/tuyul.png',
    pocong: '/assets/images/ghosts/pocong.png',
    kuntilanak: '/assets/images/ghosts/kuntilanak.png',
    genderuwo: '/assets/images/ghosts/genderuwo.png',
    buto_ijo: '/assets/images/ghosts/buto-ijo.png',
  };

  for (const [ghostKey, expectedUrl] of Object.entries(expectedImages)) {
    const def = GHOST_DEFINITIONS[ghostKey as keyof typeof GHOST_DEFINITIONS];
    assert.equal(def.imageUrl, expectedUrl);
    assert.equal(fs.existsSync(path.join(process.cwd(), 'public', expectedUrl)), true);
  }

  for (const lvl of LEVEL_CONFIGS) {
    assert.equal(fs.existsSync(path.join(process.cwd(), 'public', lvl.previewImage)), true, `Missing preview: ${lvl.previewImage}`);
  }

  assert.equal(AUDIO_MANIFEST['ghosts/pocong/voice'], '/assets/audio/ghosts/pocong/voice.mp3');
  assert.equal(AUDIO_MANIFEST['ghosts/kuntilanak/voice'], '/assets/audio/ghosts/kuntilanak/voice.mp3');
  assert.equal(AUDIO_MANIFEST['ghosts/buto-ijo/voice'], '/assets/audio/ghosts/buto-ijo/voice.mp3');
  assert.equal(AUDIO_MANIFEST['ghosts/tuyul/voice'], '/assets/audio/ghosts/tuyul/voice.mp3');
  assert.equal(AUDIO_MANIFEST['ghosts/genderuwo/voice'], '/assets/audio/ghosts/genderuwo/voice.mp3');

  for (const [key, url] of Object.entries(AUDIO_MANIFEST)) {
    assert.equal(url, `/assets/audio/${key}.mp3`, `Non-uniform audio path for ${key}: ${url}`);
    assert.equal(fs.existsSync(path.join(process.cwd(), 'public', url)), true, `Missing asset: ${url}`);
  }

  assert.equal(fs.existsSync(path.join(process.cwd(), 'public', 'assets', 'aistudio')), false);
  assert.equal(fs.existsSync(path.join(process.cwd(), 'src', 'assets')), false);
  assert.equal(fs.existsSync(path.join(process.cwd(), 'scripts')), false);

  const referenced = new Set<string>([
    ...Object.values(AUDIO_MANIFEST),
    ...Object.values(GHOST_DEFINITIONS).map((g) => g.imageUrl),
    ...LEVEL_CONFIGS.map((l) => l.previewImage),
  ]);

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else out.push('/' + path.relative(path.join(process.cwd(), 'public'), full).replace(/\\/g, '/'));
    }
    return out;
  };

  const actualPublicFiles = walk(path.join(process.cwd(), 'public'));
  assert.deepEqual(
    actualPublicFiles.filter((f) => !referenced.has(f)),
    [],
    'Every file in public/ must be referenced by the app',
  );
});

test('ghost death explosion themes map white (tuyul/pocong/kuntilanak), red (genderuwo), and green (buto_ijo)', async () => {
  const { getGhostExplosionColorTheme } = await import('./rules');

  for (const whiteGhost of ['tuyul', 'pocong', 'kuntilanak'] as const) {
    const theme = getGhostExplosionColorTheme(whiteGhost);
    assert.equal(theme.flashHex, 0xffffff);
    assert.ok(theme.smokeHex.every((c) => c >= 0xd0dce6));
    assert.ok(theme.particleHex.every((c) => c >= 0xd0dce6));
  }

  const genderuwoTheme = getGhostExplosionColorTheme('genderuwo');
  assert.equal(genderuwoTheme.flashHex, 0xff3b3b);
  assert.ok(genderuwoTheme.smokeHex.every((c) => ((c >> 16) & 0xff) > ((c >> 8) & 0xff) * 2));
  assert.ok(genderuwoTheme.particleHex.every((c) => ((c >> 16) & 0xff) > ((c >> 8) & 0xff) * 2));

  const butoTheme = getGhostExplosionColorTheme('buto_ijo');
  assert.equal(butoTheme.flashHex, 0x39ff7a);
  assert.ok(butoTheme.smokeHex.every((c) => ((c >> 8) & 0xff) > ((c >> 16) & 0xff) * 2));
  assert.ok(
    butoTheme.particleHex.every((c) => {
      const r = (c >> 16) & 0xff;
      const g = (c >> 8) & 0xff;
      const b = c & 0xff;
      return g > r * 2 && g > b;
    }),
  );
});

test('face_attack entrance zooms out rapidly for regular ghosts, and slowly fades in with gentle smooth float for kuntilanak', async () => {
  const {
    EXPLOSION_OVAL_LIGHT_OPACITY,
    EXPLOSION_PARTICLE_OPACITY,
    SMOKE_CENTER_MAX_ALPHA,
    computeFaceAttackEntranceState,
  } = await import('./rules');

  // Realistic smoke, explosion particle & glowing oval opacity bounds
  assert.equal(SMOKE_CENTER_MAX_ALPHA, 0.6);
  assert.equal(EXPLOSION_PARTICLE_OPACITY, 0.15);
  assert.equal(EXPLOSION_OVAL_LIGHT_OPACITY, 0.2);

  // Kuntilanak: slow fade-in from 0 -> 1 over ~1.45s, ZERO shake/tremor, gentle smooth hover float
  const k0 = computeFaceAttackEntranceState({
    ghostType: 'kuntilanak',
    ageSec: 0,
    elapsedSec: 5.0,
    wobbleAngle: 0.4,
    movePhase: 1.2,
  });
  const kMid = computeFaceAttackEntranceState({
    ghostType: 'kuntilanak',
    ageSec: 0.725,
    elapsedSec: 5.725,
    wobbleAngle: 0.4,
    movePhase: 1.2,
  });
  const kDone = computeFaceAttackEntranceState({
    ghostType: 'kuntilanak',
    ageSec: 1.6,
    elapsedSec: 6.6,
    wobbleAngle: 0.4,
    movePhase: 1.2,
  });
  const kNextFrame = computeFaceAttackEntranceState({
    ghostType: 'kuntilanak',
    ageSec: 1.616,
    elapsedSec: 6.616,
    wobbleAngle: 0.4,
    movePhase: 1.2,
  });

  assert.equal(k0.opacity, 0);
  assert.equal(k0.tremorX, 0);
  assert.equal(k0.tremorY, 0);
  assert.equal(k0.rotationZ, 0);
  assert.ok(kMid.opacity > 0.35 && kMid.opacity < 0.65);
  assert.equal(kDone.opacity, 1);

  for (const s of [k0, kMid, kDone]) {
    assert.equal(s.allowShake, false);
    assert.ok(Math.abs(s.tremorX) <= 0.05);
    assert.ok(Math.abs(s.tremorY) <= 0.08);
    assert.ok(Math.abs(s.rotationZ) <= 0.03);
    assert.ok(s.scaleMultiplier <= 1.04);
  }
  assert.ok(Math.abs(kDone.tremorY) > 0 || Math.abs(kDone.tremorX) > 0, 'kuntilanak should float gently once visible');
  assert.ok(Math.abs(kNextFrame.tremorY - kDone.tremorY) < 0.004, 'kuntilanak float must stay smooth frame-to-frame');

  // Non-Kuntilanak (e.g. pocong): immediate opaque pop-in, super-fast zoom-out from >= 2.4x down to ~0.93-1.05x
  const p0 = computeFaceAttackEntranceState({
    ghostType: 'pocong',
    ageSec: 0,
    elapsedSec: 1.0,
    wobbleAngle: 0.2,
    movePhase: 0.5,
  });
  const pSnap = computeFaceAttackEntranceState({
    ghostType: 'pocong',
    ageSec: 0.075,
    elapsedSec: 1.075,
    wobbleAngle: 0.2,
    movePhase: 0.5,
  });
  const pSettle = computeFaceAttackEntranceState({
    ghostType: 'pocong',
    ageSec: 0.28,
    elapsedSec: 1.28,
    wobbleAngle: 0.2,
    movePhase: 0.5,
  });
  assert.equal(p0.opacity, 1);
  assert.ok(p0.scaleMultiplier >= 2.4, 'must start oversized in front of camera for fast zoom-out');
  assert.ok(pSnap.scaleMultiplier <= 1.05, 'must zoom out super fast within 75ms');
  assert.ok(pSettle.scaleMultiplier >= 0.9 && pSettle.scaleMultiplier <= 1.15);
  assert.equal(p0.allowShake, true);
  assert.equal(pSnap.allowShake, true);
});

test('GhostVoiceScheduler prioritizes face_attack voices in strict screen-arrival FIFO order without overlap', async () => {
  const { GhostVoiceScheduler } = await import('./rules');

  const scheduler = new GhostVoiceScheduler<string>(250, 900);

  // Ambient voice is currently playing
  const amb = scheduler.request('ghosts/tuyul/taunt', 'ambient', 1000, 'tuyul');
  assert.equal(amb.action, 'play_now');
  scheduler.markStarted(1.5, 1000, 'ambient');

  // Face 1 (Pocong) appears while ambient plays -> preempts ambient & plays immediately
  const f1 = scheduler.request('ghosts/pocong/voice', 'face_attack', 1400, 'face1');
  assert.equal(f1.action, 'preempt_and_play');
  scheduler.markStarted(9.2, 1400, 'face_attack'); // Long ~9.2s clip must NOT be clamped to 4.8s

  // While Pocong (face1) is still speaking at 5.5s, Kuntilanak (face2) & Buto Ijo (face3) appear
  assert.equal(scheduler.isBusy(5500), true);
  const f2 = scheduler.request('ghosts/kuntilanak/voice', 'face_attack', 5500, 'face2');
  const f3 = scheduler.request('ghosts/buto-ijo/voice', 'face_attack', 6200, 'face3');
  assert.equal(f2.action, 'queued');
  assert.equal(f3.action, 'queued');
  assert.equal(scheduler.getPendingFaceCount(), 2);

  // Ambient voices are strictly blocked while face_attack voices are queued
  const droppedAmb = scheduler.request('ghosts/genderuwo/growl', 'ambient', 6400, 'amb');
  assert.equal(droppedAmb.action, 'dropped');

  // Cannot consume while face1 is still busy
  assert.equal(scheduler.consumePending(9000), null);

  // Once face1 ends + gap passes -> face2 (Kuntilanak) plays FIRST, then face3 (Buto Ijo) NEXT
  scheduler.markEnded(10600);
  assert.equal(scheduler.consumePending(10700), null);
  const next2 = scheduler.consumePending(10820);
  assert.ok(next2 && next2.key === 'ghosts/kuntilanak/voice' && next2.meta === 'face2');

  scheduler.markStarted(3.0, 10820, 'face_attack');
  scheduler.markEnded(13820);
  const next3 = scheduler.consumePending(14050);
  assert.ok(next3 && next3.key === 'ghosts/buto-ijo/voice' && next3.meta === 'face3');
});

test('level transitions use slow dramatic durations and title screen picks spaced non-repeating random ghost voices', async () => {
  const {
    LEVEL_FADE_IN_MS,
    LEVEL_FADE_OUT_MS,
    TITLE_GHOST_VOICE_MIN_DELAY_MS,
    computeLevelCurtainOpacity,
    computeTitleGhostVoiceDelayMs,
    pickRandomTitleGhostVoiceKey,
  } = await import('./rules');

  assert.ok(LEVEL_FADE_OUT_MS >= 900);
  assert.ok(LEVEL_FADE_IN_MS >= 1000);
  assert.ok(TITLE_GHOST_VOICE_MIN_DELAY_MS >= 10000);

  assert.equal(computeLevelCurtainOpacity('idle', 0.5), 0);
  assert.equal(computeLevelCurtainOpacity('holding', 0), 1);
  assert.equal(computeLevelCurtainOpacity('fading_out', 0), 0);
  assert.equal(computeLevelCurtainOpacity('fading_out', 0.5), 0.5);
  assert.equal(computeLevelCurtainOpacity('fading_out', 1), 1);
  assert.equal(computeLevelCurtainOpacity('fading_in', 0), 1);
  assert.equal(computeLevelCurtainOpacity('fading_in', 0.5), 0.5);
  assert.equal(computeLevelCurtainOpacity('fading_in', 1), 0);

  let prev = null;
  for (let i = 0; i < 6; i += 1) {
    const picked = pickRandomTitleGhostVoiceKey(prev, () => (i * 0.19) % 1);
    assert.notEqual(picked.ghostType, prev);
    assert.ok(picked.key.startsWith('ghosts/') && picked.key.endsWith('/voice'));
    prev = picked.ghostType;
  }

  const initDelay = computeTitleGhostVoiceDelayMs(true, () => 0.5);
  const repeatDelay = computeTitleGhostVoiceDelayMs(false, () => 0.5);
  assert.ok(initDelay >= 3000 && initDelay < repeatDelay);
  assert.ok(repeatDelay >= TITLE_GHOST_VOICE_MIN_DELAY_MS);
});




