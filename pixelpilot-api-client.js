 /**
 * PixelPilot AI — Frontend API Client
 * ─────────────────────────────────────────────────
 * Drop this <script> tag into any PixelPilot HTML page.
 * Replace API_BASE_URL with your Railway deployment URL.
 *
 * Usage:
 *   const client = new PixelPilotAPI();
 *   const project = await client.uploadVideo(file, userId, "My Edit");
 *   const jobs    = await client.processVideo(project.project_id, userId, ["remove_silences","transcribe"]);
 *   const status  = await client.getJobStatus(jobs.job_ids[0]);
 */

class PixelPilotAPI {

  constructor() {
    // ← Replace with your Railway URL after deploying
    this.base = "pixel-pilot-ai-backend-production.up.railway.app";
  }

  // ── helper ────────────────────────────────────────
  async _fetch(path, options = {}) {
    const res = await fetch(`${this.base}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "API error");
    }
    return res.json();
  }


  // ── UPLOAD ────────────────────────────────────────

  /**
   * Upload a video file and create a project.
   * @param {File}   file         - HTML File object from <input type="file">
   * @param {string} userId       - your user's ID
   * @param {string} projectName  - display name
   * @returns {Promise<{project_id, video_url, file_name, file_size_bytes}>}
   */
  async uploadVideo(file, userId, projectName = "Untitled") {
    const form = new FormData();
    form.append("file", file);
    form.append("user_id", userId);
    form.append("project_name", projectName);

    const res = await fetch(`${this.base}/upload/video`, {
      method: "POST",
      body: form,   // no Content-Type header — browser sets multipart boundary
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  }


  // ── PROCESS ───────────────────────────────────────

  /**
   * Queue AI processing tasks on a project.
   * @param {string}   projectId - from uploadVideo()
   * @param {string}   userId
   * @param {string[]} tasks     - e.g. ["remove_silences", "transcribe", "color_grade"]
   * @param {object}   params    - per-task options
   * @returns {Promise<{job_ids: string[], project_id: string}>}
   *
   * Example params:
   * {
   *   color_grade:     { style: "teal_orange" },
   *   remove_silences: { threshold_db: -40, min_silence_ms: 500 },
   *   reframe:         { aspect_ratio: "9:16" }
   * }
   */
  async processVideo(projectId, userId, tasks, params = {}) {
    return this._fetch("/process/", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, user_id: userId, tasks, params }),
    });
  }


  // ── JOB STATUS ────────────────────────────────────

  /**
   * Get the current status of a single job.
   * @returns {Promise<{id, status, progress, result, error}>}
   */
  async getJobStatus(jobId) {
    return this._fetch(`/process/status/${jobId}`);
  }

  /**
   * Get all jobs for a project.
   */
  async getAllJobs(projectId) {
    return this._fetch(`/process/all/${projectId}`);
  }

  /**
   * Poll a job until it completes or fails.
   * @param {string}   jobId
   * @param {function} onProgress  - called with (progress: 0-100, status: string)
   * @param {number}   intervalMs  - polling interval (default 2000ms)
   */
  async pollJob(jobId, onProgress = () => {}, intervalMs = 2000) {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const job = await this.getJobStatus(jobId);
          onProgress(job.progress, job.status);

          if (job.status === "done") {
            clearInterval(interval);
            resolve(job);
          } else if (job.status === "failed") {
            clearInterval(interval);
            reject(new Error(job.error || "Job failed"));
          }
        } catch (e) {
          clearInterval(interval);
          reject(e);
        }
      }, intervalMs);
    });
  }


  // ── PROJECTS ──────────────────────────────────────

  async listProjects(userId) {
    return this._fetch(`/projects/?user_id=${userId}`);
  }

  async getProject(projectId, userId) {
    return this._fetch(`/projects/${projectId}?user_id=${userId}`);
  }

  async deleteProject(projectId, userId) {
    return this._fetch(`/projects/${projectId}?user_id=${userId}`, { method: "DELETE" });
  }


  // ── EXPORT ────────────────────────────────────────

  /**
   * Trigger an export job.
   * @param {string} projectId
   * @param {string} userId
   * @param {object} options - { format: "mp4", resolution: "1080p", fps: 30 }
   */
  async exportVideo(projectId, userId, options = {}) {
    return this._fetch("/export/", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        user_id: userId,
        format:     options.format     || "mp4",
        resolution: options.resolution || "1080p",
        fps:        options.fps        || 30,
      }),
    });
  }
}


// ── EXAMPLE: Full upload → process → export flow ──────────────
// Uncomment and adapt this in your pixelpilot-dashboard.html

/*
const api    = new PixelPilotAPI();
const userId = "demo-user-123";   // replace with real auth user ID

// 1. Upload
const fileInput = document.getElementById("videoInput");
const file      = fileInput.files[0];
const upload    = await api.uploadVideo(file, userId, "My First Edit");
console.log("Uploaded:", upload.project_id);

// 2. Process
const processing = await api.processVideo(
  upload.project_id,
  userId,
  ["remove_silences", "transcribe", "color_grade"],
  {
    color_grade:     { style: "teal_orange" },
    remove_silences: { min_silence_ms: 500 }
  }
);

// 3. Poll all jobs
for (const jobId of processing.job_ids) {
  api.pollJob(jobId, (progress, status) => {
    console.log(`Job ${jobId}: ${status} ${progress}%`);
    // update your UI progress bar here
  }).then(job => {
    console.log("Job done:", job.result);
  });
}

// 4. Export when ready
const exportJob = await api.exportVideo(upload.project_id, userId, {
  format: "mp4", resolution: "4K", fps: 30
});
console.log("Export started:", exportJob.job_id);
*/
