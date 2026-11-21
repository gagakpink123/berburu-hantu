import test from 'node:test';
import assert from 'node:assert/strict';
import { GHOST_DEFINITIONS, LEVEL_CONFIGS } from './levels';
import {
  FIXED_STAGE_HEIGHT,
  FIXED_STAGE_WIDTH,
  GHOST_ALERT_DURATION_MS,
  GHOST_ALERT_MAX_ROWS,
  GhostVoiceScheduler,
  KILL_CAM_BOSS_DURATION_SEC,
  KILL_CAM_REGULAR_DURATION_SEC,
  MAX_PITCH_RAD,
  MAX_YAW_RAD,
  METEOR_MAX_COOLDOWN_SEC,
  METEOR_MIN_COOLDOWN_SEC,
  MIN_GENDERUWO_COOLDOWN_WAVES,
  MOBILE_MENU_UI_SCALE,
  VHS_MYSTICAL_PRESET,
  VHS_THIN_PRESET,
  WIDE_LENS_DISTORTION,
  WILDLIFE_CALL_MAX_DELAY_SEC,
  WILDLIFE_CALL_MIN_DELAY_SEC,
  applyGhostDamage,
  buildPacedSpawnDeck,
  buildSpawnTypeDeck,
  calculateAccuracy,
  calculateCompletionBonuses,
  calculateHitScore,
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
  formatGhostSpawnAlert,
  getAmbienceTargetGain,
  getDifficultyModifiers,
  getGhostExplosionProfile,
  isGhostVoiceAudioKey,
  isPhoneViewport,
  mapScreenNdcToWideLensNdc,
  pickOccasionalWildlifeCall,
  pruneExpiredGhostAlerts,
  pushGhostAlertQueue,
  resolveGhostSpawnPacing,
  resolveMousePointerVisibility,
  shuffleArray,
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

test('scoring scales with combo, kill state, and scare mode', () => {
  const chipHit = calculateHitScore('genderuwo', 2, 'petualangan', false);
  const killHit = calculateHitScore('genderuwo', 2, 'petualangan', true);
  assert.ok(killHit > chipHit);

  const santaiKill = calculateHitScore('pocong', 0, 'santai', true);
  const hororKill = calculateHitScore('pocong', 0, 'horor', true);
  assert.ok(hororKill > santaiKill);
});

test('accuracy and completion bonuses compute deterministically', () => {
  assert.equal(calculateAccuracy(0, 0), 0);
  assert.equal(calculateAccuracy(8, 10), 80);
  assert.equal(calculateAccuracy(12, 10), 100);

  const bonuses = calculateCompletionBonuses(85, 5, 20);
  assert.equal(bonuses.accuracyBonus, 450);
  assert.equal(bonuses.comboBonus, 300);
  assert.equal(bonuses.timeBonus, 240);
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
    assert.ok(curr.previewImage.startsWith('/src/assets/images/'));
    previewSet.add(curr.previewImage);
    // Feasibility: timer leaves plenty of headroom (>= 3.5s per required kill)
    assert.ok(curr.durationSec / curr.targetKills >= 3.5, `Level ${curr.id} timer feasible for targetKills`);

    if (i > 0) {
      const prev = LEVEL_CONFIGS[i - 1];
      assert.ok(curr.targetKills > prev.targetKills, `Level ${curr.id} targetKills must exceed Level ${prev.id}`);
      assert.ok(curr.targetScore > prev.targetScore, `Level ${curr.id} targetScore must exceed Level ${prev.id}`);
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
  assert.ok(VHS_THIN_PRESET.grainBase <= 0.025);
  assert.ok(VHS_MYSTICAL_PRESET.grainBase > VHS_THIN_PRESET.grainBase);
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



