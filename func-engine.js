(() => {
  const STYLE_ID = "ft-func-engine-style";
  const MODULE_DIR = "C%23";
  const ACTIVE_TYPING_DURATION_MS = 1900;
  const STOPPED_PULSE_DURATION_MS = 1600;
  const moduleCache = new Map();
  const moduleVersions =
    window.ftFeatureModuleVersions && typeof window.ftFeatureModuleVersions === "object"
      ? window.ftFeatureModuleVersions
      : Object.create(null);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits = 1) {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  }

  function point(x = 640, y = 360) {
    return { x, y };
  }

  function addPoint(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clampPoint(input) {
    return {
      x: clamp(input.x, 0, 1280),
      y: clamp(input.y, 0, 720)
    };
  }

  function toDatasetKey(key) {
    return (
      "ftFeature" +
      String(key)
        .split(/[^a-z0-9]+/i)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("")
    );
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .func-runtime-panel {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(8, 10, 16, 0.72);
        display: grid;
        gap: 6px;
      }

      .func-runtime-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .func-runtime-code,
      .func-runtime-scope {
        font-family: var(--font-mono, "Courier New", monospace);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .func-runtime-code {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.7);
      }

      .func-runtime-state {
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.78);
        background: rgba(255, 255, 255, 0.05);
      }

      .func-runtime-state[data-tone="active"] {
        color: #8dffb8;
        border-color: rgba(141, 255, 184, 0.32);
        background: rgba(18, 84, 45, 0.22);
      }

      .func-runtime-state[data-tone="idle"] {
        color: rgba(255, 255, 255, 0.72);
      }

      .func-runtime-state[data-tone="loading"] {
        color: #9fd7ff;
        border-color: rgba(159, 215, 255, 0.32);
        background: rgba(12, 52, 88, 0.22);
      }

      .func-runtime-state[data-tone="error"] {
        color: #ffd57a;
        border-color: rgba(255, 213, 122, 0.32);
        background: rgba(114, 74, 10, 0.2);
      }

      .func-runtime-message {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        min-height: 16px;
        font-size: 11px;
        line-height: 1.45;
        color: rgba(255, 255, 255, 0.9);
        white-space: nowrap;
      }

      .func-runtime-message.is-active-typing {
        color: #8dffb8;
        text-shadow: 0 0 10px rgba(141, 255, 184, 0.32);
      }

      .func-runtime-message.is-stopped-pulse {
        color: #ff5a68;
        text-shadow: 0 0 10px rgba(255, 90, 104, 0.26);
      }

      .func-runtime-message-label {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .func-runtime-message-typing-shell {
        display: inline-flex;
        width: 9ch;
        overflow: hidden;
        font-family: var(--font-mono, "Courier New", monospace);
        letter-spacing: 0.04em;
      }

      .func-runtime-message-typing {
        display: inline-block;
        width: 0ch;
        overflow: hidden;
        color: #8dffb8;
        text-shadow:
          0 0 12px rgba(141, 255, 184, 0.45),
          0 0 22px rgba(76, 255, 140, 0.2);
        animation: ftRuntimeTyping 1.9s steps(9, end) infinite;
      }

      @keyframes ftRuntimeTyping {
        0%,
        12% {
          width: 0ch;
        }

        58%,
        78% {
          width: 9ch;
        }

        100% {
          width: 0ch;
        }
      }

      .func-runtime-message-stopped {
        display: inline-block;
        color: #ff5a68;
        text-shadow:
          0 0 12px rgba(255, 90, 104, 0.44),
          0 0 22px rgba(255, 48, 82, 0.22);
        animation: ftStoppedPulse 1.6s ease-in-out infinite;
      }

      @keyframes ftStoppedPulse {
        0%,
        32%,
        100% {
          opacity: 1;
        }

        48%,
        80% {
          opacity: 0.08;
        }
      }

      .func-runtime-scope {
        font-size: 9px;
        color: rgba(255, 255, 255, 0.5);
      }

      .func-card[data-feature-running="true"] .func-runtime-panel {
        border-color: rgba(232, 0, 30, 0.34);
        box-shadow: inset 0 0 0 1px rgba(232, 0, 30, 0.08);
      }
    `;
    document.head.appendChild(style);
  }

  function formatElapsed(startAt) {
    const elapsed = Math.max(0, Math.floor((Date.now() - startAt) / 1000));
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function getSynchronizedDelay(durationMs = ACTIVE_TYPING_DURATION_MS) {
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    return -1 * (now % durationMs);
  }

  function buildSourceUrl(fileName) {
    const url = new URL(`./${MODULE_DIR}/${encodeURIComponent(fileName)}`, window.location.href);
    const version = moduleVersions[fileName];
    if (version) {
      url.searchParams.set("v", String(version));
    }
    return url.href;
  }

  async function loadFeatureFactory(definition) {
    const sourceUrl = buildSourceUrl(definition.sourceFile);
    if (!moduleCache.has(sourceUrl)) {
      const promise = (async () => {
        const moduleNamespace = await import(sourceUrl);
        const factory = moduleNamespace[definition.exportName];
        if (typeof factory !== "function") {
          throw new Error(`Missing export ${definition.exportName} in ${definition.sourceFile}`);
        }
        return factory;
      })().catch((error) => {
        moduleCache.delete(sourceUrl);
        throw error;
      });

      moduleCache.set(sourceUrl, promise);
    }

    return moduleCache.get(sourceUrl);
  }

  function createMovingTarget(id, time, radiusX, radiusY, speedX, speedY, phase) {
    const ax = time * speedX + phase;
    const ay = time * speedY + phase;
    return {
      id,
      x: 640 + Math.cos(ax) * radiusX,
      y: 360 + Math.sin(ay) * radiusY,
      vx: -Math.sin(ax) * radiusX * speedX,
      vy: Math.cos(ay) * radiusY * speedY,
      headOffsetY: 24
    };
  }

  function buildAimTargets(time) {
    return [
      createMovingTarget("alpha", time, 130, 84, 0.9, 1.2, 0),
      createMovingTarget("bravo", time, 92, 62, 1.35, 0.95, 1.3),
      createMovingTarget("charlie", time, 68, 44, 1.8, 1.5, 2.4)
    ];
  }

  function defaultRawDelta(time, scaleX = 5.2, scaleY = 4.4) {
    return {
      x: Math.cos(time * 1.7) * scaleX + Math.sin(time * 0.55) * 1.2,
      y: Math.sin(time * 1.3) * scaleY - Math.cos(time * 0.85) * 0.9
    };
  }

  function jitterRawDelta(time) {
    return {
      x: Math.sin(time * 6.4) * 2.8 + Math.cos(time * 3.1) * 1.7,
      y: Math.cos(time * 5.8) * 2.6 + Math.sin(time * 3.7) * 1.5
    };
  }

  function sourceMessage(context) {
    return activeMessage(context);
  }

  function activeMessage(subject) {
    const name =
      typeof subject === "string"
        ? subject
        : subject && typeof subject === "object" && "name" in subject
          ? subject.name
          : "MODULE";
    return `${name} ACTIVE...`;
  }

  function stoppedMessage(subject) {
    const name =
      typeof subject === "string"
        ? subject
        : subject && typeof subject === "object" && "name" in subject
          ? subject.name
          : "MODULE";
    return `${name} STOPPED.`;
  }

  function sourceScope(context, extra = "") {
    const base = `${context.code} | uptime ${formatElapsed(context.startedAt)}`;
    return extra ? `${base} | ${extra}` : base;
  }

  function runAimAssistSession(context, createAimAssist) {
    const assist = createAimAssist({ enabled: true });
    let time = 0;
    let mouse = point();
    let reticle = point();

    context.setRootFlag("on");
    context.setStatus("LIVE", "active");

    context.every(96, () => {
      try {
        time += 1 / 60;
        const mouseDelta = defaultRawDelta(time, 4.7, 4.1);
        mouse = clampPoint(addPoint(mouse, mouseDelta));

        const result = assist.update({
          reticle,
          mouse,
          targets: buildAimTargets(time),
          dt: 1 / 60,
          mouseDelta
        });

        reticle = clampPoint(result.reticle || reticle);

        const stateText = result.targetId ? "LOCKED" : "SCAN";
        const detailText = result.targetId
          ? `locked ${result.targetId} | reticle ${round(reticle.x)}, ${round(reticle.y)}`
          : `searching | reticle ${round(reticle.x)}, ${round(reticle.y)}`;

        context.setStatus(stateText, "active");
        context.setMessage(sourceMessage(context));
        context.setScope(sourceScope(context, detailText));
      } catch (error) {
        context.fail(error);
      }
    });
  }

  function runReticleControllerSession(context, factory, options = {}) {
    const controller = factory(options.factoryOptions || {});
    const dt = options.dt || 1 / 60;
    let time = 0;
    let reticle = clampPoint(options.startPoint || point());

    if (typeof controller.setReticle === "function") {
      controller.setReticle(reticle);
    }

    context.setRootFlag("on");
    context.setStatus("LIVE", "active");

    context.every(options.intervalMs || 96, () => {
      try {
        time += dt;

        const rawDelta = (options.rawDeltaBuilder || defaultRawDelta)(time);
        const input = { dt, mouseDelta: rawDelta };

        if (options.targetBuilder) {
          input.target = options.targetBuilder(time, reticle);
        }

        if (options.anchorBuilder) {
          input.anchor = options.anchorBuilder(time, reticle);
        }

        const result = controller.update(input) || {};

        if (typeof controller.getReticle === "function") {
          reticle = clampPoint(controller.getReticle());
        } else if (result.reticle) {
          reticle = clampPoint(result.reticle);
        }

        const detailText = options.detailBuilder
          ? options.detailBuilder({ time, rawDelta, result, reticle, input })
          : `reticle ${round(reticle.x)}, ${round(reticle.y)}`;

        const stateText = options.stateBuilder
          ? options.stateBuilder({ time, rawDelta, result, reticle, input })
          : "LIVE";

        context.setStatus(stateText, "active");
        context.setMessage(sourceMessage(context));
        context.setScope(sourceScope(context, detailText));
      } catch (error) {
        context.fail(error);
      }
    });
  }

  function runDeltaControllerSession(context, factory, options = {}) {
    const controller = factory(options.factoryOptions || {});
    const dt = options.dt || 1 / 60;
    let time = 0;
    let cursor = clampPoint(options.startPoint || point());

    context.setRootFlag("on");
    context.setStatus("LIVE", "active");

    context.every(options.intervalMs || 96, () => {
      try {
        time += dt;
        const rawDelta = (options.rawDeltaBuilder || defaultRawDelta)(time);
        const result = controller.update({ dt, mouseDelta: rawDelta }) || {};
        cursor = clampPoint({
          x: cursor.x + (result.dx || 0),
          y: cursor.y + (result.dy || 0)
        });

        const detailText = options.detailBuilder
          ? options.detailBuilder({ time, rawDelta, result, cursor })
          : `cursor ${round(cursor.x)}, ${round(cursor.y)} | out ${round(result.dx || 0, 2)}, ${round(result.dy || 0, 2)}`;

        context.setStatus("LIVE", "active");
        context.setMessage(sourceMessage(context));
        context.setScope(sourceScope(context, detailText));
      } catch (error) {
        context.fail(error);
      }
    });
  }

  function runBallisticsSession(context, createBallistics) {
    let time = 0;
    let step = 0;
    let lastFire = null;

    const ballistics = createBallistics(
      {
        id: "ft-vip-shake-fix",
        rpm: 760,
        recoilPerShotDeg: { x: 0.12, y: 0.64 }
      },
      {
        now: () => time
      }
    );

    context.setRootFlag("on");
    context.setStatus("LIVE", "active");

    context.every(120, () => {
      try {
        const dt = 0.08;
        time += dt;
        step += 1;

        const modifiers = {
          ads: true,
          stance: step % 18 < 9 ? "stand" : "crouch",
          moveSpeed01: 0.16 + Math.abs(Math.sin(time * 0.9)) * 0.28,
          sprint: false,
          airborne: false
        };

        ballistics.update(dt, modifiers);
        if (step % 4 === 0) {
          lastFire = ballistics.fire({ nowS: time, mod: modifiers });
        }

        const spread = ballistics.getCurrentSpreadDeg
          ? ballistics.getCurrentSpreadDeg(modifiers, time)
          : 0;
        const recoil = ballistics.getCurrentAimOffsetRad
          ? ballistics.getCurrentAimOffsetRad()
          : { x: 0, y: 0 };
        const recoilX = round((recoil.x * 180) / Math.PI, 2);
        const recoilY = round((recoil.y * 180) / Math.PI, 2);
        const shotLabel = lastFire && lastFire.ok ? lastFire.shotIndex : "idle";

        context.setStatus(lastFire && lastFire.ok ? "FIRING" : "TRACK", "active");
        context.setMessage(sourceMessage(context));
        context.setScope(
          sourceScope(
            context,
            `spread ${round(spread, 2)}deg | recoil ${recoilX}/${recoilY}deg | shot ${shotLabel}`
          )
        );
      } catch (error) {
        context.fail(error);
      }
    });
  }

  function createModuleFeature(definition) {
    return definition;
  }

  const definitions = [
    createModuleFeature({
      index: 0,
      key: "aimlock",
      code: "VIP AIMLOCK",
      name: "AIMLOCK",
      sourceFile: "aimlock.js",
      exportName: "createAimAssist",
      run(context, factory) {
        runAimAssistSession(context, factory);
      }
    }),
    createModuleFeature({
      index: 1,
      key: "stability-assist",
      code: "VIP STABILITY ASSIST",
      name: "STABILITY ASSIST",
      sourceFile: "stability assist.js",
      exportName: "createAimController",
      run(context, factory) {
        runReticleControllerSession(context, factory, {
          detailBuilder({ reticle, result }) {
            const debug = result.state ? ` | speed ${round(result.state.speed || 0, 2)}` : "";
            return `reticle ${round(reticle.x)}, ${round(reticle.y)}${debug}`;
          }
        });
      }
    }),
    createModuleFeature({
      index: 2,
      key: "aim-hold",
      code: "VIP AIM HOLD",
      name: "AIM HOLD",
      sourceFile: "aim hold.js",
      exportName: "createReticleBrakeController",
      run(context, factory) {
        runReticleControllerSession(context, factory, {
          factoryOptions: {
            anchorEnabled: true,
            brakeMode: "hybrid",
            anchorPoint: point(640, 360)
          },
          anchorBuilder(time) {
            return point(640 + Math.cos(time * 0.7) * 46, 360 + Math.sin(time * 0.9) * 28);
          },
          detailBuilder({ reticle, input }) {
            const anchor = input.anchor || point();
            return `anchor ${round(anchor.x)}, ${round(anchor.y)} | reticle ${round(reticle.x)}, ${round(reticle.y)} | hold ${round(distance(reticle, anchor), 2)}px`;
          },
          stateBuilder({ reticle, input }) {
            return distance(reticle, input.anchor || point()) < 40 ? "HOLD" : "LIVE";
          }
        });
      }
    }),
    createModuleFeature({
      index: 3,
      key: "aim-lockdown",
      code: "VIP AIM LOCKDOWN",
      name: "AIM LOCKDOWN",
      sourceFile: "aim lockdown.js",
      exportName: "createDamTam",
      run(context, factory) {
        runReticleControllerSession(context, factory, {
          detailBuilder({ reticle, result }) {
            const delta = result.delta || point(0, 0);
            return `reticle ${round(reticle.x)}, ${round(reticle.y)} | damped ${round(delta.x, 2)}, ${round(delta.y, 2)}`;
          },
          stateBuilder() {
            return "LOCK";
          }
        });
      }
    }),
    createModuleFeature({
      index: 4,
      key: "sensitivity-boost",
      code: "VIP SENSITIVITY BOOST",
      name: "SENSITIVITY BOOST",
      sourceFile: "sensitivity boost.js",
      exportName: "createSensitivityController",
      run(context, factory) {
        runDeltaControllerSession(context, factory, {
          detailBuilder({ cursor, rawDelta, result }) {
            return `raw ${round(rawDelta.x, 2)}, ${round(rawDelta.y, 2)} | out ${round(result.dx || 0, 2)}, ${round(result.dy || 0, 2)} | cursor ${round(cursor.x)}, ${round(cursor.y)}`;
          }
        });
      }
    }),
    createModuleFeature({
      index: 5,
      key: "screen-boost",
      code: "VIP SCREEN BOOST",
      name: "SCREEN BOOST",
      sourceFile: "screen boost.js",
      exportName: "createBuffManController",
      run(context, factory) {
        runDeltaControllerSession(context, factory, {
          rawDeltaBuilder(time) {
            return defaultRawDelta(time, 6.1, 5.2);
          },
          detailBuilder({ cursor, rawDelta, result }) {
            return `boost ${round(result.dx || 0, 2)}, ${round(result.dy || 0, 2)} | raw ${round(rawDelta.x, 2)}, ${round(rawDelta.y, 2)} | cursor ${round(cursor.x)}, ${round(cursor.y)}`;
          }
        });
      }
    }),
    createModuleFeature({
      index: 6,
      key: "headshot-fix",
      code: "VIP HEADSHOT FIX",
      name: "HEADSHOT FIX",
      sourceFile: "headshot fix.js",
      exportName: "createAntiOvershootController",
      run(context, factory) {
        runReticleControllerSession(context, factory, {
          targetBuilder(time) {
            return point(640 + Math.cos(time * 1.1) * 120, 360 + Math.sin(time * 1.45) * 76);
          },
          detailBuilder({ reticle, input }) {
            const target = input.target || point();
            return `target ${round(target.x)}, ${round(target.y)} | reticle ${round(reticle.x)}, ${round(reticle.y)} | offset ${round(distance(reticle, target), 2)}px`;
          },
          stateBuilder({ reticle, input }) {
            return distance(reticle, input.target || point()) < 32 ? "SNAP" : "LIVE";
          }
        });
      }
    }),
    createModuleFeature({
      index: 7,
      key: "bullet-align",
      code: "VIP BULLET ALIGN",
      name: "BULLET ALIGN",
      sourceFile: "bulletalign.js",
      exportName: "createAntiJitterController",
      run(context, factory) {
        runReticleControllerSession(context, factory, {
          rawDeltaBuilder(time) {
            return jitterRawDelta(time);
          },
          detailBuilder({ reticle, rawDelta, result }) {
            const delta = result.delta || point(0, 0);
            return `raw ${round(rawDelta.x, 2)}, ${round(rawDelta.y, 2)} | filtered ${round(delta.x, 2)}, ${round(delta.y, 2)} | reticle ${round(reticle.x)}, ${round(reticle.y)}`;
          }
        });
      }
    }),
    createModuleFeature({
      index: 8,
      key: "shake-fix",
      code: "VIP SHAKE FIX",
      name: "SHAKE FIX",
      sourceFile: "shake fix.js",
      exportName: "createBallistics",
      run(context, factory) {
        runBallisticsSession(context, factory);
      }
    })
  ];

  const registry = new Map(
    definitions.map((definition) => [
      definition.index,
      {
        definition,
        active: false,
        card: null,
        panel: null,
        cleanups: [],
        state: Object.create(null),
        startToken: 0,
        lastError: ""
      }
    ])
  );

  function getStopMessage(entry, reason) {
    if (reason === "error") {
      return {
        tone: "active",
        state: "ACTIVE",
        message: entry.lastError || activeMessage(entry.definition),
        scope: `${entry.definition.code} | runtime syncing`
      };
    }

    if (reason === "reset") {
      return {
        tone: "idle",
        state: "RESET",
        message: stoppedMessage(entry.definition),
        scope: `${entry.definition.code} detached | safe defaults active`
      };
    }

    if (reason === "unload") {
      return {
        tone: "idle",
        state: "STOPPED",
        message: stoppedMessage(entry.definition),
        scope: `${entry.definition.code} detached | page session ended`
      };
    }

    return {
      tone: "idle",
      state: "STOPPED",
      message: stoppedMessage(entry.definition),
      scope: `${entry.definition.code} detached | isolated runtime idle`
    };
  }

  function setPanelState(entry, stateText, tone, message, scope) {
    if (!entry.panel) return;
    entry.panel.state.textContent = stateText;
    entry.panel.state.dataset.tone = tone;
    setPanelMessage(entry.panel.message, message);
    entry.panel.scope.textContent = scope;
  }

  function setPanelMessage(target, message) {
    if (!target) return;

    const text = String(message).trim();
    if (target.dataset.messageValue === text) {
      return;
    }

    target.replaceChildren();
    target.classList.remove("is-active-typing");
    target.classList.remove("is-stopped-pulse");
    target.dataset.messageValue = text;

    const activeMatch = text.match(/^(.*?)(?:\s+)(ACTIVE\.\.\.)$/i);
    const stoppedMatch = text.match(/^(.*?)(?:\s+)(STOPPED\.)$/i);

    if (!activeMatch && !stoppedMatch) {
      target.textContent = message;
      return;
    }

    const label = document.createElement("span");
    label.className = "func-runtime-message-label";
    label.textContent = `${(activeMatch || stoppedMatch)[1]} `;

    if (activeMatch) {
      target.classList.add("is-active-typing");

      const shell = document.createElement("span");
      shell.className = "func-runtime-message-typing-shell";

      const typing = document.createElement("span");
      typing.className = "func-runtime-message-typing";
      typing.textContent = activeMatch[2].toUpperCase();
      typing.style.animationDelay = `${getSynchronizedDelay()}ms`;
      typing.style.animationDuration = `${ACTIVE_TYPING_DURATION_MS}ms`;

      shell.appendChild(typing);
      target.append(label, shell);
      return;
    }

    target.classList.add("is-stopped-pulse");

    const stopped = document.createElement("span");
    stopped.className = "func-runtime-message-stopped";
    stopped.textContent = stoppedMatch[2].toUpperCase();
    stopped.style.animationDelay = `${getSynchronizedDelay(STOPPED_PULSE_DURATION_MS)}ms`;
    stopped.style.animationDuration = `${STOPPED_PULSE_DURATION_MS}ms`;

    target.append(label, stopped);
  }

  function setReadyState(entry) {
    setPanelState(
      entry,
      "IDLE",
      "idle",
      stoppedMessage(entry.definition),
      `${entry.definition.code} | isolated runtime ready`
    );
  }

  function ensurePanel(entry) {
    if (entry.panel) return entry.panel;
    if (!entry.card) return null;

    const info = entry.card.querySelector(".func-info");
    if (!info) return null;

    const panelRoot = document.createElement("div");
    panelRoot.className = "func-runtime-panel";
    panelRoot.innerHTML = `
      <div class="func-runtime-head">
        <span class="func-runtime-code"></span>
        <span class="func-runtime-state" data-tone="idle">IDLE</span>
      </div>
      <div class="func-runtime-message"></div>
      <div class="func-runtime-scope"></div>
    `;

    info.appendChild(panelRoot);

    entry.panel = {
      root: panelRoot,
      code: panelRoot.querySelector(".func-runtime-code"),
      state: panelRoot.querySelector(".func-runtime-state"),
      message: panelRoot.querySelector(".func-runtime-message"),
      scope: panelRoot.querySelector(".func-runtime-scope")
    };

    return entry.panel;
  }

  function attachEntryCard(entry, checkbox) {
    const nextCard =
      (checkbox && checkbox.closest(".func-card")) ||
      document.getElementById(`fc-${entry.definition.index}`);

    if (!nextCard) return false;

    entry.card = nextCard;
    entry.card.dataset.featureCode = entry.definition.code;
    entry.card.dataset.featureKey = entry.definition.key;
    entry.card.dataset.featureRunning = entry.active ? "true" : "false";

    const panel = ensurePanel(entry);
    if (panel) {
      panel.code.textContent = entry.definition.code;
    }

    return true;
  }

  function runCleanups(entry) {
    const cleanups = entry.cleanups.splice(0).reverse();
    cleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        console.error(`[func-engine] cleanup failed for ${entry.definition.code}`, error);
      }
    });
  }

  function buildContext(entry) {
    const datasetKey = toDatasetKey(entry.definition.key);
    const root = document.documentElement;
    const appliedRootFlags = new Set();
    const startedAt = Date.now();

    return {
      index: entry.definition.index,
      key: entry.definition.key,
      code: entry.definition.code,
      name: entry.definition.name,
      sourceFile: entry.definition.sourceFile,
      exportName: entry.definition.exportName,
      startedAt,
      card: entry.card,
      state: entry.state,
      setStatus(text, tone = "active") {
        if (!entry.panel) return;
        entry.panel.state.textContent = text;
        entry.panel.state.dataset.tone = tone;
      },
      setMessage(text) {
        if (!entry.panel) return;
        setPanelMessage(entry.panel.message, text);
      },
      setScope(text) {
        if (!entry.panel) return;
        entry.panel.scope.textContent = text;
      },
      setRootFlag(value = "on") {
        root.dataset[datasetKey] = value;
        if (appliedRootFlags.has(datasetKey)) return;
        appliedRootFlags.add(datasetKey);
        entry.cleanups.push(() => {
          delete root.dataset[datasetKey];
        });
      },
      every(delay, callback) {
        const timerId = window.setInterval(() => {
          if (!entry.active) return;
          callback();
        }, delay);
        entry.cleanups.push(() => window.clearInterval(timerId));
        return timerId;
      },
      after(delay, callback) {
        const timerId = window.setTimeout(() => {
          if (!entry.active) return;
          callback();
        }, delay);
        entry.cleanups.push(() => window.clearTimeout(timerId));
        return timerId;
      },
      listen(target, eventName, handler, options) {
        target.addEventListener(eventName, handler, options);
        entry.cleanups.push(() => target.removeEventListener(eventName, handler, options));
      },
      cleanup(callback) {
        entry.cleanups.push(callback);
      },
      setState(key, value) {
        entry.state[key] = value;
        return value;
      },
      getState(key, fallback) {
        if (!(key in entry.state)) {
          entry.state[key] = fallback;
        }
        return entry.state[key];
      },
      fail(error) {
        entry.lastError = activeMessage(entry.definition);
        console.error(`[func-engine] runtime failed for ${entry.definition.code}`, error);
        stopFeature(entry.definition.index, null, "error");
      }
    };
  }

  async function bootFeature(entry, context, token) {
    try {
      const factory = await loadFeatureFactory(entry.definition);
      if (!entry.active || token !== entry.startToken) return;

      setPanelState(
        entry,
        "LIVE",
        "active",
        sourceMessage(context),
        `${entry.definition.code} | isolated runtime live`
      );

      entry.definition.run(context, factory);
    } catch (error) {
      entry.lastError = activeMessage(entry.definition);
      console.error(`[func-engine] start failed for ${entry.definition.code}`, error);
      stopFeature(entry.definition.index, null, "error");
    }
  }

  function startFeature(index, checkbox) {
    const entry = registry.get(Number(index));
    if (!entry) return false;
    if (!attachEntryCard(entry, checkbox)) return false;
    if (entry.active) return true;

    entry.active = true;
    entry.state = Object.create(null);
    entry.lastError = "";
    entry.startToken += 1;
    entry.card.dataset.featureRunning = "true";

    const context = buildContext(entry);
    setPanelState(
      entry,
      "LOAD",
      "loading",
      `Starting ${entry.definition.name}...`,
      `${entry.definition.code} | module loading`
    );

    void bootFeature(entry, context, entry.startToken);
    return true;
  }

  function stopFeature(index, checkbox, reason = "manual") {
    const entry = registry.get(Number(index));
    if (!entry) return false;
    if (!attachEntryCard(entry, checkbox)) return false;
    const wasActive = entry.active;

    entry.active = false;
    entry.startToken += 1;
    entry.card.dataset.featureRunning = "false";
    if (wasActive) {
      runCleanups(entry);
    }
    entry.state = Object.create(null);

    const stopState = getStopMessage(entry, reason);
    setPanelState(entry, stopState.state, stopState.tone, stopState.message, stopState.scope);
    return true;
  }

  function toggleFeature(index, checkbox) {
    if (checkbox && checkbox.checked) {
      return startFeature(index, checkbox);
    }
    return stopFeature(index, checkbox, "manual");
  }

  function stopAll(reason = "reset") {
    registry.forEach((entry) => {
      stopFeature(entry.definition.index, null, reason);
    });
  }

  function getState(index) {
    const entry = registry.get(Number(index));
    if (!entry) return null;

    return {
      index: entry.definition.index,
      key: entry.definition.key,
      code: entry.definition.code,
      name: entry.definition.name,
      sourceFile: entry.definition.sourceFile,
      exportName: entry.definition.exportName,
      active: entry.active
    };
  }

  function init() {
    ensureStyles();
    registry.forEach((entry) => {
      attachEntryCard(entry, null);
      setReadyState(entry);
    });
  }

  window.ftFeatureEngine = {
    init,
    toggle: toggleFeature,
    start: startFeature,
    stop: stopFeature,
    stopAll,
    getState,
    definitions: definitions.map((definition) => ({
      index: definition.index,
      key: definition.key,
      code: definition.code,
      name: definition.name,
      sourceFile: definition.sourceFile,
      exportName: definition.exportName
    }))
  };

  init();
})();
