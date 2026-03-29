// ========================================
// Responsive Breakpoints Generator — App
// Vanilla JS, no jQuery
// ========================================

(function () {
  "use strict";

  // ---- State ----
  let lastImageInfo = null;
  let selectedScreenSizes = [];
  const debug = window.location.search.includes("debug=true");

  const log = (...args) => {
    if (debug && console && console.log) console.log(...args);
  };

  // ---- DOM refs ----
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  const uploadZone = $("#upload-zone");
  const loader = $("#loader");
  const settingsForm = $("#settings-form");
  const resultsHolder = $("#results-holder");
  const regenBtn = $("#regenerate-btn");

  // ---- Helpers ----
  function bytesToSize(bytes) {
    bytes = Number(bytes);
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "n/a";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i === 0) return bytes + " " + sizes[i];
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
  }

  function shortFileName(url) {
    const match = url.match(/\/image\/upload\/(.*?)\/v\d+\/(.*)\.(.*)$/);
    if (match) {
      return (match[2] + "_" + match[1] + "." + match[3])
        .replace(/:/g, "_")
        .replace(/\//g, "__");
    }
    return url;
  }

  // Rewrite a Cloudinary secure_url to a specific format + width
  // e.g. https://res.cloudinary.com/cloud/image/upload/v123/id.jpg
  //   → https://res.cloudinary.com/cloud/image/upload/q_auto,f_avif/c_scale,w_800/v123/id.avif
  function cloudinaryFormatUrl(secureUrl, format, width) {
    // Match: .../image/upload/[optional_transforms/]v<version>/<public_id>.<ext>
    const m = secureUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+\/)?v(\d+)\/(.+)\.[^.]+$/);
    if (m) {
      return `${m[1]}q_auto,f_${format}/c_scale,w_${width}/v${m[3]}/${m[4]}.${format}`;
    }
    // Fallback: just append format params
    return secureUrl;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formToMap() {
    const data = {};
    const fd = new FormData(settingsForm);
    for (const [key, value] of fd.entries()) {
      if (key.endsWith("[]")) {
        data[key] = data[key] || [];
        data[key].push(value);
      } else {
        data[key] = value;
      }
    }
    return data;
  }

  function screenSizeNumbersToDescription(minW, maxW) {
    if (minW && maxW) return "Width: " + minW + "–" + maxW;
    if (minW) return "Width ≥ " + minW;
    if (maxW) return "Width < " + maxW;
    return "Any width";
  }

  function screenSizePairToNumbers(pair) {
    const parts = pair.split(",");
    return [parts[0] || null, parts[1] || null];
  }

  // ---- Theme toggle ----
  (function initTheme() {
    const toggle = $("[data-theme-toggle]");
    const root = document.documentElement;
    let theme = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    root.setAttribute("data-theme", theme);

    if (toggle) {
      updateToggleIcon(toggle, theme);
      toggle.addEventListener("click", () => {
        theme = theme === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", theme);
        updateToggleIcon(toggle, theme);
      });
    }

    function updateToggleIcon(btn, t) {
      btn.setAttribute(
        "aria-label",
        "Switch to " + (t === "dark" ? "light" : "dark") + " mode"
      );
      btn.innerHTML =
        t === "dark"
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
  })();

  // ---- Range input live values ----
  function initRangeInputs() {
    const ranges = [
      { id: "min-width", display: "min-width-val", suffix: "" },
      { id: "max-width", display: "max-width-val", suffix: "" },
      {
        id: "bytes-step",
        display: "bytes-step-val",
        suffix: " KB",
      },
      { id: "max-images", display: "max-images-val", suffix: "" },
    ];

    ranges.forEach(({ id, display, suffix }) => {
      const input = document.getElementById(id);
      const label = document.getElementById(display);
      if (input && label) {
        input.addEventListener("input", () => {
          label.textContent = input.value + suffix;
        });
      }
    });
  }

  // ---- Art-direction device checkboxes ----
  function initDeviceCheckboxes() {
    $$(".screen-size-check").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const row = checkbox.closest(".device-row");
        const selects = $$("select", row);
        selects.forEach((sel) => (sel.disabled = !checkbox.checked));
        row.classList.toggle("disabled", !checkbox.checked);
        updateScreenSizes();
      });
    });
  }

  function updateScreenSizes() {
    let maxDefined = false;
    const checkboxes = $$(".screen-size-check");

    checkboxes.forEach((cb) => {
      const row = cb.closest(".device-row");
      const noteEl = $(".resolution-note", row);
      const hiddenInput = $('input[name="screen_sizes[]"]', row);
      let note = "-";
      let value = ",";

      if (cb.checked) {
        const nextChecked = checkboxes.filter(
          (other) =>
            other !== cb &&
            other.checked &&
            checkboxes.indexOf(other) > checkboxes.indexOf(cb)
        );
        let minWidth, maxWidth;

        if (nextChecked.length > 0) {
          minWidth =
            parseInt(nextChecked[0].dataset.maxWidth || "0", 10) + 1 || undefined;
        }
        if (maxDefined) {
          maxWidth = parseInt(cb.dataset.maxWidth || "0", 10) || undefined;
        }

        maxDefined = true;
        note = screenSizeNumbersToDescription(minWidth, maxWidth);
        value = (minWidth || "") + "," + (maxWidth || "");
      }

      if (noteEl) noteEl.textContent = note;
      if (hiddenInput) hiddenInput.value = value;
    });
  }

  // ---- Cloudinary Upload Widget ----
  function initUploadWidget() {
    // NOTE: Update cloud_name and upload_preset to match your Cloudinary account
    const widget = cloudinary.createUploadWidget(
      {
        cloud_name: "paulapplegate-com",
        upload_preset: "responsive_bp",
        theme: "minimal",
        multiple: false,
        sources: ["local", "url"],
        resource_type: "image",
        showPoweredBy: false,
      },
      (error, result) => {
        log("Upload widget callback:", error, result);
        if (error) {
          console.error("Upload error:", error);
          return;
        }
        if (result && result.event === "success") {
          log("Upload success, info:", JSON.stringify(result.info));
          processImage(result.info);
        }
        // Also log all other events for debugging
        if (result) {
          log("Widget event:", result.event);
        }
      }
    );

    uploadZone.addEventListener("click", (e) => {
      if (uploadZone.classList.contains("processing")) return;
      widget.open();
    });
  }

  // ---- Sample images ----
  function initSampleImages() {
    $$('.sample-img-btn input[type="radio"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (uploadZone.classList.contains("processing")) return;

        // Highlight active
        $$(".sample-img-btn").forEach((b) => b.classList.remove("active"));
        radio.closest(".sample-img-btn").classList.add("active");

        const info = JSON.parse(radio.dataset.imageInfo);
        processImage(info);
      });
    });
  }

  // ---- Processing pipeline ----
  function setProcessing(active) {
    if (active) {
      uploadZone.classList.add("processing");
      $(".upload-content", uploadZone).style.display = "none";
      loader.classList.add("active");
      regenBtn.disabled = true;
    } else {
      uploadZone.classList.remove("processing");
      $(".upload-content", uploadZone).style.display = "";
      loader.classList.remove("active");
      regenBtn.disabled = false;
    }
  }

  function processImage(imageInfo) {
    log("imageInfo:", imageInfo);
    setProcessing(true);

    prepareAuthentication(imageInfo, (authInfo) => {
      if (!authInfo) {
        setProcessing(false);
        return;
      }
      requestBreakpoints(authInfo, (bpInfo) => {
        if (bpInfo && bpInfo.responsive_breakpoints) {
          renderResults(imageInfo, bpInfo);
          lastImageInfo = imageInfo;
          regenBtn.style.display = "";
        } else {
          log("No breakpoints returned", bpInfo);
          const msg = (bpInfo && bpInfo.error && bpInfo.error.message) || "No breakpoints returned. The image may be too small or the API returned an error.";
          resultsHolder.innerHTML = `
            <div class="result-card" style="text-align:center;padding:var(--space-8)">
              <p style="color:var(--color-error);font-weight:600">Could not generate breakpoints</p>
              <p style="color:var(--color-text-muted);margin-top:var(--space-2);font-size:var(--text-sm)">${msg}</p>
            </div>`;
        }
        setProcessing(false);
      });
    });
  }

  function prepareAuthentication(imageInfo, callback) {
    document.getElementById("public_id").value = imageInfo.public_id;
    const params = formToMap();

    selectedScreenSizes = [];
    if (params["aspect_ratios[]"]) {
      params["aspect_ratios[]"].forEach((ratio, i) => {
        const screenSize = params["screen_sizes[]"][i];
        const nums = screenSizePairToNumbers(screenSize);
        selectedScreenSizes[i] = {
          aspect_ratio: ratio,
          screen_size: screenSize,
          screen_min_width: nums[0],
          screen_max_width: nums[1],
          screen_size_description: screenSizeNumbersToDescription(
            nums[0],
            nums[1]
          ).toLowerCase(),
          view_port_ratio: params["view_port_ratios[]"][i],
          dpr: params.retina === "1" ? 2 : 1,
        };
      });
    }

    fetch("./authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(
        new FormData(settingsForm)
      ).toString(),
    })
      .then((r) => r.json())
      .then((data) => {
        log("authInfo:", data);
        callback(data);
      })
      .catch((err) => {
        console.error("Auth error:", err);
        callback(null);
      });
  }

  function requestBreakpoints(authInfo, callback) {
    const formData = new URLSearchParams();
    for (const [k, v] of Object.entries(authInfo.params)) {
      formData.append(k, v);
    }

    fetch(authInfo.url, {
      method: "POST",
      body: formData,
    })
      .then((r) => r.json())
      .then((data) => {
        log("breakpointsInfo:", data);
        callback(data);
      })
      .catch((err) => {
        console.error("Breakpoints error:", err);
        callback(null);
      });
  }

  function prepareZipUrl(bpInfo, callback) {
    const formData = new URLSearchParams();
    formData.append("public_id", bpInfo.public_id);
    formData.append(
      "breakpoints",
      JSON.stringify(bpInfo.responsive_breakpoints)
    );

    fetch("./zip_url", {
      method: "POST",
      body: formData,
    })
      .then((r) => r.json())
      .then((data) => callback(data))
      .catch(() => callback(null));
  }

  // ---- Render results ----
  function renderResults(imageInfo, bpInfo) {
    const bpResults = bpInfo.responsive_breakpoints;

    // Enrich breakpoints data
    bpResults.forEach((item, index) => {
      const screenInfo = selectedScreenSizes[index];
      if (screenInfo) {
        Object.assign(item, screenInfo);
      } else {
        item.aspect_ratio = "original";
        item.view_port_ratio = 100;
      }
      item.reversed_breakpoints = [...item.breakpoints].reverse();
      item.max_image_logical_width = item.breakpoints[0].width;
      item.max_view_port_width = Math.round(
        item.max_image_logical_width / (item.view_port_ratio / 100)
      );

      item.reversed_breakpoints.forEach((bp) => {
        bp.width_percents =
          (bp.width / item.breakpoints[0].width) * 100;
        bp.height_percents =
          (bp.height / item.breakpoints[0].height) * 100;
      });
    });

    const imageFormat = bpInfo.format.toUpperCase();
    const imageSize = bytesToSize(bpInfo.bytes);

    let html = `
      <section class="results-section">
        <div class="results-header">
          <h2>Breakpoint Results</h2>
          <p>Original: ${bpInfo.width}&times;${bpInfo.height} ${imageFormat}, ${imageSize}</p>
        </div>`;

    // Each aspect ratio result
    bpResults.forEach((item) => {
      const srcsetParts = item.reversed_breakpoints
        .map((bp) => `${bp.secure_url} ${bp.width}w`)
        .join(", ");

      const imgSrc = item.breakpoints[0].secure_url;
      const maxBp = item.breakpoints[0];

      // Table rows
      const tableRows = item.reversed_breakpoints
        .map(
          (bp, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${bp.width}px</td>
            <td>${bp.height}px</td>
            <td>${bytesToSize(bp.bytes)}</td>
            <td><a href="${bp.secure_url}" target="_blank" rel="noopener noreferrer">View</a></td>
          </tr>`
        )
        .join("");

      // Size visualization
      const maxBytes = Math.max(...item.reversed_breakpoints.map((b) => b.bytes));
      const sizeBars = item.reversed_breakpoints
        .map(
          (bp) => `
          <div class="size-bar" style="height: ${Math.max(8, (bp.bytes / maxBytes) * 100)}%">
            <span class="size-bar-label">${bp.width}px &middot; ${bytesToSize(bp.bytes)}</span>
          </div>`
        )
        .join("");

      // IMG tag code
      const imgCode = `&lt;<span class="tag">img</span>
  <span class="attr">sizes</span>=<span class="val">"(max-width: ${item.max_view_port_width}px) ${item.view_port_ratio}vw, ${item.max_image_logical_width}px"</span>
  <span class="attr">srcset</span>=<span class="val">"
${item.reversed_breakpoints.map((bp) => `    ${shortFileName(bp.url)} ${bp.width}w`).join(",\n")}"</span>
  <span class="attr">src</span>=<span class="val">"${shortFileName(item.breakpoints[0].url)}"</span>
  <span class="attr">alt</span>=<span class="val">""</span>&gt;`;

      const screenDetail = item.screen_size
        ? `${item.view_port_ratio}% viewport &middot; ${item.screen_size_description}`
        : "";

      // Multi-format <picture> tag with JXL, AVIF, JPG sources
      const sizesAttr = `(max-width: 768px) 100vw, (max-width: 1200px) 50vw, ${item.max_image_logical_width}px`;
      const formats = [
        { ext: "jxl", mime: "image/jxl" },
        { ext: "avif", mime: "image/avif" },
      ];
      const fallbackExt = "jpg";
      const maxW = item.breakpoints[0].width;
      const firstBp = item.breakpoints[0]; // largest

      let multiFormatCode = `&lt;<span class="tag">picture</span>&gt;\n`;

      formats.forEach(({ ext, mime }) => {
        const srcsetLines = item.reversed_breakpoints
          .map((bp) => `    ${cloudinaryFormatUrl(bp.secure_url, ext, bp.width)} ${bp.width}w`)
          .join(",\n");
        multiFormatCode += `  &lt;<span class="tag">source</span>\n`;
        multiFormatCode += `    <span class="attr">type</span>=<span class="val">"${mime}"</span>\n`;
        multiFormatCode += `    <span class="attr">srcset</span>=<span class="val">"\n${srcsetLines}"</span>\n`;
        multiFormatCode += `    <span class="attr">sizes</span>=<span class="val">"${sizesAttr}"</span>\n`;
        multiFormatCode += `  /&gt;\n`;
      });

      // JPG fallback img
      const jpgSrcset = item.reversed_breakpoints
        .map((bp) => `    ${cloudinaryFormatUrl(bp.secure_url, fallbackExt, bp.width)} ${bp.width}w`)
        .join(",\n");
      multiFormatCode += `  &lt;<span class="tag">img</span>\n`;
      multiFormatCode += `    <span class="attr">src</span>=<span class="val">"${cloudinaryFormatUrl(firstBp.secure_url, fallbackExt, 800)}"</span>\n`;
      multiFormatCode += `    <span class="attr">srcset</span>=<span class="val">"\n${jpgSrcset}"</span>\n`;
      multiFormatCode += `    <span class="attr">sizes</span>=<span class="val">"${sizesAttr}"</span>\n`;
      multiFormatCode += `    <span class="attr">alt</span>=<span class="val">""</span>\n`;
      multiFormatCode += `    <span class="attr">loading</span>=<span class="val">"lazy"</span>\n`;
      multiFormatCode += `    <span class="attr">width</span>=<span class="val">"${firstBp.width}"</span>\n`;
      multiFormatCode += `    <span class="attr">height</span>=<span class="val">"${firstBp.height}"</span>\n`;
      multiFormatCode += `  /&gt;\n`;
      multiFormatCode += `&lt;/<span class="tag">picture</span>&gt;`;

      html += `
        <div class="result-card fade-up">
          <h3>${item.aspect_ratio} aspect ratio</h3>
          ${screenDetail ? `<p class="screen-detail">${screenDetail}</p>` : ""}
          <div class="result-grid">
            <div>
              <figure class="result-image">
                <img sizes="(max-width: 1200px) 100vw, 50vw"
                     srcset="${srcsetParts}"
                     src="${imgSrc}"
                     alt="Responsive breakpoint preview"
                     loading="lazy">
                <figcaption>Resize the browser to see responsive behavior</figcaption>
              </figure>
              <div class="size-viz">${sizeBars}</div>
            </div>
            <div>
              <table class="bp-table">
                <thead>
                  <tr><th>#</th><th>Width</th><th>Height</th><th>Size</th><th></th></tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>

              <h4 style="font-family:var(--font-display);font-size:var(--text-sm);font-weight:600;margin-top:var(--space-6);margin-bottom:var(--space-2);color:var(--color-text)">&lt;img&gt; tag</h4>
              <div class="code-block">
                <button class="copy-btn" onclick="copyCode(this)">Copy</button>
                <pre><code>${imgCode}</code></pre>
              </div>

              <h4 style="font-family:var(--font-display);font-size:var(--text-sm);font-weight:600;margin-top:var(--space-6);margin-bottom:var(--space-2);color:var(--color-text)">&lt;picture&gt; with JXL + AVIF + JPG</h4>
              <div class="code-block">
                <button class="copy-btn" onclick="copyCode(this)">Copy</button>
                <pre><code>${multiFormatCode}</code></pre>
              </div>
            </div>
          </div>
        </div>`;
    });

    // Picture tag (if multi-ratio)
    if (bpResults.length > 1) {
      const reversed = [...bpResults].reverse();
      let pictureCode = `&lt;<span class="tag">picture</span>&gt;\n`;

      reversed.forEach((item, i) => {
        if (i === reversed.length - 1) {
          // Last = img fallback
          pictureCode += `  &lt;<span class="tag">img</span>\n`;
          pictureCode += `    <span class="attr">sizes</span>=<span class="val">"(max-width: ${item.max_view_port_width}px) ${item.view_port_ratio}vw, ${item.max_image_logical_width}px"</span>\n`;
          pictureCode += `    <span class="attr">srcset</span>=<span class="val">"${item.reversed_breakpoints.map((bp) => shortFileName(bp.url) + " " + bp.width + "w").join(", ")}"</span>\n`;
          pictureCode += `    <span class="attr">src</span>=<span class="val">"${shortFileName(item.breakpoints[0].url)}"</span>\n`;
          pictureCode += `    <span class="attr">alt</span>=<span class="val">""</span>&gt;\n`;
        } else {
          // Source elements
          pictureCode += `  &lt;<span class="tag">source</span>\n`;
          if (item.screen_min_width && item.screen_max_width) {
            pictureCode += `    <span class="attr">media</span>=<span class="val">"(min-width: ${item.screen_min_width}px) and (max-width: ${item.screen_max_width}px)"</span>\n`;
          } else if (item.screen_min_width) {
            pictureCode += `    <span class="attr">media</span>=<span class="val">"(min-width: ${item.screen_min_width}px)"</span>\n`;
          } else if (item.screen_max_width) {
            pictureCode += `    <span class="attr">media</span>=<span class="val">"(max-width: ${item.screen_max_width}px)"</span>\n`;
          }
          pictureCode += `    <span class="attr">srcset</span>=<span class="val">"${item.reversed_breakpoints.map((bp) => shortFileName(bp.url) + " " + bp.width + "w").join(", ")}"</span>&gt;\n`;
        }
      });

      pictureCode += `&lt;/<span class="tag">picture</span>&gt;`;

      html += `
        <div class="result-card fade-up">
          <h3>HTML5 &lt;picture&gt; tag</h3>
          <div class="code-block">
            <button class="copy-btn" onclick="copyCode(this)">Copy</button>
            <pre><code>${pictureCode}</code></pre>
          </div>
        </div>`;
    }

    // Download section
    html += `
        <div class="download-section fade-up">
          <div>
            <a href="#" class="download-link pending" id="download-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download ZIP
            </a>
          </div>
          <p>Download all generated breakpoint images as a ZIP file.</p>
        </div>
      </section>`;

    resultsHolder.innerHTML = html;

    // Prepare ZIP URL
    prepareZipUrl(bpInfo, (zipInfo) => {
      const link = document.getElementById("download-link");
      if (link && zipInfo) {
        link.href = zipInfo.url;
        link.classList.remove("pending");
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      }
    });

    // Smooth scroll to results
    resultsHolder.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- Copy code ----
  window.copyCode = function (btn) {
    const code = btn.nextElementSibling.textContent;
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 2000);
    });
  };

  // ---- Footer API code tabs ----
  function initApiTabs() {
    const codes = {
      node: `cloudinary.v2.uploader.upload("sample.jpg", {
  responsive_breakpoints: {
    create_derived: true,
    bytes_step: 20000,
    min_width: 200,
    max_width: 1000,
    transformation: {
      crop: "fill",
      aspect_ratio: "16:9",
      gravity: "auto"
    }
  }
}, (error, result) => {
  console.log(result);
});`,
      ruby: `Cloudinary::Uploader.upload("sample.jpg",
  responsive_breakpoints: {
    create_derived: true,
    bytes_step: 20000,
    min_width: 200,
    max_width: 1000,
    transformation: {
      crop: :fill,
      aspect_ratio: "16:9",
      gravity: :auto
    }
  }
)`,
      python: `cloudinary.uploader.upload("sample.jpg",
  responsive_breakpoints = {
    "create_derived": True,
    "bytes_step": 20000,
    "min_width": 200,
    "max_width": 1000,
    "transformation": {
      "crop": "fill",
      "aspect_ratio": "16:9",
      "gravity": "auto"
    }
  }
)`,
      php: `\\Cloudinary\\Uploader::upload("sample.jpg",
  array(
    "responsive_breakpoints" => array(
      "create_derived" => true,
      "bytes_step" => 20000,
      "min_width" => 200,
      "max_width" => 1000,
      "transformation" => array(
        "crop" => "fill",
        "aspect_ratio" => "16:9",
        "gravity" => "auto"
      )
    )
  )
);`,
    };

    const content = document.getElementById("api-code-content");
    const tabs = $$(".code-tab");

    function showLang(lang) {
      content.textContent = codes[lang] || codes.node;
      tabs.forEach((t) => t.classList.toggle("active", t.dataset.lang === lang));
    }

    tabs.forEach((tab) =>
      tab.addEventListener("click", () => showLang(tab.dataset.lang))
    );

    showLang("node");
  }

  // ---- Regenerate ----
  function initRegenerate() {
    regenBtn.addEventListener("click", () => {
      if (lastImageInfo) {
        processImage(lastImageInfo);
      }
    });
  }

  // ---- Init ----
  function init() {
    initRangeInputs();
    initDeviceCheckboxes();
    initUploadWidget();
    initSampleImages();
    initApiTabs();
    initRegenerate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
