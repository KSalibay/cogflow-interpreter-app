(function (jspsych) {
  const PT = (jspsych && jspsych.ParameterType)
    || (window.jsPsychModule && window.jsPsychModule.ParameterType)
    || (window.jsPsych && window.jsPsych.ParameterType)
    || {
      BOOL: 'BOOL',
      STRING: 'STRING',
      INT: 'INT',
      FLOAT: 'FLOAT',
      OBJECT: 'OBJECT',
      KEY: 'KEY',
      KEYS: 'KEYS',
      SELECT: 'SELECT',
      HTML_STRING: 'HTML_STRING',
      COMPLEX: 'COMPLEX',
      FUNCTION: 'FUNCTION',
      TIMELINE: 'TIMELINE'
    };

  const info = {
    name: 'continuous-image-presentation',
    version: '1.0.0',
    parameters: {
      image_url: { type: PT.STRING, default: '' },
      asset_filename: { type: PT.STRING, default: '' },

      mask_to_image_sprite_url: { type: PT.STRING, default: null },
      image_to_mask_sprite_url: { type: PT.STRING, default: null },
      transition_frames: { type: PT.INT, default: 8 },

      image_duration_ms: { type: PT.INT, default: 750 },
      transition_duration_ms: { type: PT.INT, default: 200 },

      choices: { type: PT.KEYS, default: ['f', 'j'] }
    },
    data: {
      response_key: { type: PT.STRING },
      rt_ms: { type: PT.INT },
      responded: { type: PT.BOOL },
      ended_reason: { type: PT.STRING },
      plugin_version: { type: PT.STRING }
    }
  };

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function normalizeKeyName(raw) {
    const str = (raw ?? '').toString();
    if (str === ' ') return ' ';

    const t = str.trim();
    const lower = t.toLowerCase();
    if (lower === 'space') return ' ';
    if (lower === 'enter') return 'Enter';
    if (lower === 'escape' || lower === 'esc') return 'Escape';
    if (t.length === 1) return t.toLowerCase();
    return t;
  }

  function expandKeyVariants(key) {
    const k = (key || '').toString();
    if (k.length === 1 && /[a-z]/i.test(k)) return [k.toLowerCase(), k.toUpperCase()];
    return [k];
  }

  function normalizeChoices(raw) {
    if (raw === undefined || raw === null) return ['f', 'j'];
    if (Array.isArray(raw)) {
      return raw.map(normalizeKeyName).filter(Boolean);
    }
    const s = String(raw);
    const parts = s
      .split(/[\n,]/g)
      .map(x => normalizeKeyName(x))
      .filter(Boolean);
    return parts.length > 0 ? parts : ['f', 'j'];
  }

  function preloadImage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  let _trialUid = 0;

  class JsPsychContinuousImagePresentationPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const uid = (++_trialUid);

      const imageUrl = (trial.image_url ?? '').toString();
      const filename = (trial.asset_filename ?? '').toString();
      const m2iUrl = (trial.mask_to_image_sprite_url ?? '') ? String(trial.mask_to_image_sprite_url) : '';
      const i2mUrl = (trial.image_to_mask_sprite_url ?? '') ? String(trial.image_to_mask_sprite_url) : '';

      const frames = Number.isFinite(Number(trial.transition_frames)) ? Math.max(1, Math.floor(Number(trial.transition_frames))) : 8;
      const imgMs = Number.isFinite(Number(trial.image_duration_ms)) ? Math.max(0, Math.floor(Number(trial.image_duration_ms))) : 750;
      const transMs = Number.isFinite(Number(trial.transition_duration_ms)) ? Math.max(0, Math.floor(Number(trial.transition_duration_ms))) : 200;

      const choices = normalizeChoices(trial.choices);
      const validKeys = Array.from(new Set(choices.flatMap(expandKeyVariants).map(normalizeKeyName).filter(Boolean)));

      let responded = false;
      let responseKey = null;
      let rt = null;
      let endedReason = null;

      let keyboardListener = null;
      let imageTimeoutId = null;
      let ended = false;

      const endTrial = () => {
        if (ended) return;
        ended = true;

        try {
          if (keyboardListener) this.jsPsych.pluginAPI.cancelKeyboardResponse(keyboardListener);
        } catch {
          // ignore
        }
        try {
          if (imageTimeoutId) this.jsPsych.pluginAPI.clearTimeout(imageTimeoutId);
        } catch {
          // ignore
        }

        // Intentionally do NOT clear the display element.
        // The final frame of image->mask should remain visible between trials,
        // so the block sequence is continuous: mask -> transition -> image -> transition -> mask -> ...
        try {
          if (promptEl) promptEl.style.opacity = '0';
        } catch {
          // ignore
        }

        this.jsPsych.finishTrial({
          response_key: responseKey,
          rt_ms: Number.isFinite(rt) ? Math.round(rt) : null,
          responded: responded === true,
          ended_reason: endedReason || (responded ? 'response' : 'timeout'),
          plugin_version: info.version
        });
      };

      const wrapId = `cip-wrap-${uid}`;
      const stageId = `cip-stage-${uid}`;
      const spriteId = `cip-sprite-${uid}`;
      const imgId = `cip-img-${uid}`;
      const promptId = `cip-prompt-${uid}`;

      display_element.innerHTML = `
        <div id="${wrapId}" style="width:100%; min-height:100vh; min-height:100svh; min-height:100dvh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; box-sizing:border-box; padding:24px 12px;">
          <div id="${stageId}" style="position:relative; display:flex; align-items:center; justify-content:center; width:100%;">
            <div id="${spriteId}" style="display:none; background-repeat:no-repeat; background-position:0% 0%; image-rendering: pixelated;"></div>
            <img id="${imgId}" alt="" style="display:none; max-width:90vw; max-height:70vh; object-fit:contain;" />
          </div>
          <div id="${promptId}" style="opacity:0.7; font-size:12px; text-align:center;"></div>
        </div>
      `;

      const wrapEl = display_element.querySelector(`#${wrapId}`);
      const stageEl = display_element.querySelector(`#${stageId}`);
      const spriteEl = display_element.querySelector(`#${spriteId}`);
      const imgEl = display_element.querySelector(`#${imgId}`);
      const promptEl = display_element.querySelector(`#${promptId}`);

      if (!wrapEl || !stageEl || !spriteEl || !imgEl || !promptEl) {
        endedReason = 'render_error';
        endTrial();
        return;
      }

      const promptText = `Press ${choices.map(k => (k === ' ' ? 'space' : k)).join(' / ')}`;
      promptEl.textContent = promptText;

      const keyframesName = `cipSpriteAnim_${uid}`;
      const styleEl = document.createElement('style');
      styleEl.textContent = `@keyframes ${keyframesName} { 0% { background-position: 0% 0%; } 100% { background-position: 100% 0%; } }`;
      document.head.appendChild(styleEl);

      const cleanupStyle = () => {
        try {
          if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        } catch {
          // ignore
        }
      };

      const setStageSizeFromDims = (w, h) => {
        const width = Number(w);
        const height = Number(h);
        if (!(width > 0) || !(height > 0)) return;

        const maxW = Math.max(50, Math.floor(window.innerWidth * 0.9));
        const maxH = Math.max(50, Math.floor(window.innerHeight * 0.7));
        const scale = Math.min(maxW / width, maxH / height, 1);

        const dispW = Math.max(1, Math.floor(width * scale));
        const dispH = Math.max(1, Math.floor(height * scale));

        spriteEl.style.width = `${dispW}px`;
        spriteEl.style.height = `${dispH}px`;
        imgEl.style.width = `${dispW}px`;
        imgEl.style.height = `${dispH}px`;
      };

      const playSprite = (url) => {
        return new Promise((resolve) => {
          if (!url || transMs <= 0 || frames <= 1) {
            resolve();
            return;
          }

          spriteEl.style.display = 'block';
          imgEl.style.display = 'none';

          spriteEl.style.backgroundImage = `url('${url.replaceAll("'", "%27")}')`;
          spriteEl.style.backgroundSize = `${frames * 100}% 100%`;
          spriteEl.style.backgroundPosition = '0% 0%';

          // Force reflow so animation reliably restarts.
          void spriteEl.offsetWidth;

          spriteEl.style.animation = `${keyframesName} ${transMs}ms steps(${frames}) 1 forwards`;

          this.jsPsych.pluginAPI.setTimeout(() => {
            spriteEl.style.animation = '';
            resolve();
          }, transMs);
        });
      };

      const showImageAndCollect = () => {
        return new Promise((resolve) => {
          spriteEl.style.display = 'none';
          imgEl.style.display = 'block';
          imgEl.src = imageUrl;

          if (!(imgMs > 0)) {
            endedReason = responded ? 'response' : 'timeout';
            resolve();
            return;
          }

          const onset = nowMs();

          const afterResponse = (info) => {
            if (responded) return;
            responded = true;
            responseKey = info && info.key ? normalizeKeyName(info.key) : null;
            rt = info && Number.isFinite(info.rt) ? info.rt : (nowMs() - onset);
            endedReason = 'response';

            try {
              if (keyboardListener) this.jsPsych.pluginAPI.cancelKeyboardResponse(keyboardListener);
              keyboardListener = null;
            } catch {
              // ignore
            }
            try {
              if (imageTimeoutId) this.jsPsych.pluginAPI.clearTimeout(imageTimeoutId);
              imageTimeoutId = null;
            } catch {
              // ignore
            }

            resolve();
          };

          keyboardListener = this.jsPsych.pluginAPI.getKeyboardResponse({
            callback_function: afterResponse,
            valid_responses: validKeys,
            rt_method: 'performance',
            persist: false,
            allow_held_key: false
          });

          imageTimeoutId = this.jsPsych.pluginAPI.setTimeout(() => {
            endedReason = responded ? 'response' : 'timeout';
            try {
              if (keyboardListener) this.jsPsych.pluginAPI.cancelKeyboardResponse(keyboardListener);
              keyboardListener = null;
            } catch {
              // ignore
            }
            resolve();
          }, imgMs);
        });
      };

      const run = async () => {
        try {
          // Preload to get dimensions and reduce flicker.
          const img0 = await preloadImage(imageUrl);
          if (img0 && img0.naturalWidth && img0.naturalHeight) {
            setStageSizeFromDims(img0.naturalWidth, img0.naturalHeight);
          }

          // If we don't have stimulus dimensions, try sprites.
          if ((!img0 || !img0.naturalWidth) && m2iUrl) {
            const s = await preloadImage(m2iUrl);
            if (s && s.naturalWidth && s.naturalHeight && frames > 0) {
              setStageSizeFromDims(Math.floor(s.naturalWidth / frames), s.naturalHeight);
            }
          }

          await playSprite(m2iUrl);
          await showImageAndCollect();
          await playSprite(i2mUrl);

          cleanupStyle();
          endTrial();
        } catch (e) {
          try {
            console.warn('[CIP] Trial failed', { imageUrl, filename, error: e });
          } catch {
            // ignore
          }
          endedReason = 'error';
          cleanupStyle();
          endTrial();
        }
      };

      run();
    }
  }

  JsPsychContinuousImagePresentationPlugin.info = info;
  window.jsPsychContinuousImagePresentation = JsPsychContinuousImagePresentationPlugin;
})(window.jsPsychModule || window.jsPsych);
