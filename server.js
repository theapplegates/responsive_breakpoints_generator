const express = require("express");
const cloudinary = require("cloudinary").v2;
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cloudinary config — set via environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Serve static files
app.use(express.static("."));

// POST /authenticate — generates signed params for Cloudinary explicit API
app.post("/authenticate", (req, res) => {
  const {
    public_id,
    aspect_ratios,
    screen_sizes,
    view_port_ratios,
    min_width,
    max_width,
    bytes_step,
    max_images,
    retina,
  } = req.body;

  const ratios = Array.isArray(aspect_ratios)
    ? aspect_ratios
    : aspect_ratios
    ? [aspect_ratios]
    : ["original"];
  const screens = Array.isArray(screen_sizes)
    ? screen_sizes
    : screen_sizes
    ? [screen_sizes]
    : [];
  const vpRatios = Array.isArray(view_port_ratios)
    ? view_port_ratios
    : view_port_ratios
    ? [view_port_ratios]
    : [];
  const isRetina = retina === "1";

  const breakpointsSettings = ratios.map((aspectRatio, index) => {
    const settings = { create_derived: true };

    // Parse numeric params
    ["min_width", "max_width", "bytes_step", "max_images"].forEach((k) => {
      const val = req.body[k];
      if (val && /^\d+$/.test(String(val))) {
        settings[k] = parseInt(val, 10);
      }
    });

    const vpRatio = parseInt(vpRatios[index] || "100", 10);

    if (screens[index]) {
      const parts = screens[index].split(",");
      const minW = parts[0]
        ? Math.ceil(parseInt(parts[0], 10) * (vpRatio / 100))
        : 0;
      const maxW = parts[1]
        ? Math.ceil(parseInt(parts[1], 10) * (vpRatio / 100))
        : 0;
      if (minW > 0) settings.min_width = minW;
      if (maxW > 0)
        settings.max_width = Math.min(settings.max_width || maxW, maxW);
    }

    // Convert bytes_step from KB to bytes
    if (settings.bytes_step) settings.bytes_step = settings.bytes_step * 1024;

    // Double max_width for retina
    if (isRetina && settings.max_width) settings.max_width *= 2;

    // Art direction transformation
    if (aspectRatio !== "original") {
      settings.transformation = {
        crop: "fill",
        aspect_ratio: aspectRatio,
        gravity: "auto",
      };
    }

    return settings;
  });

  // Build upload params for the explicit API call
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    type: "upload",
    responsive_breakpoints: JSON.stringify(breakpointsSettings),
    public_id: public_id,
    timestamp: timestamp,
  };

  // Sign the request
  const signature = cloudinary.utils.api_sign_request(
    params,
    cloudinary.config().api_secret
  );

  params.signature = signature;
  params.api_key = cloudinary.config().api_key;

  res.json({
    url: `https://api.cloudinary.com/v1_1/${cloudinary.config().cloud_name}/image/explicit`,
    params: params,
  });
});

// POST /zip_url — generates a signed ZIP download URL
app.post("/zip_url", (req, res) => {
  try {
    const breakpoints = JSON.parse(req.body.breakpoints);
    const transformations = [];

    breakpoints.forEach((bpInfo) => {
      bpInfo.breakpoints.forEach((bp) => {
        if (bpInfo.transformation) {
          transformations.push({
            transformation: [
              { raw_transformation: bpInfo.transformation },
              { crop: "scale", width: bp.width },
            ],
          });
        } else {
          transformations.push({ crop: "scale", width: bp.width });
        }
      });
    });

    const url = cloudinary.utils.download_zip_url({
      public_ids: [req.body.public_id],
      flatten_folders: true,
      transformations: transformations,
    });

    res.json({ url });
  } catch (err) {
    console.error("zip_url error:", err);
    res.status(500).json({ error: "Failed to generate ZIP URL" });
  }
});

// SPA fallback
app.get("/{*splat}", (req, res) => {
  res.sendFile("index.html", { root: "." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Express server listening on port ${PORT}`);
});
