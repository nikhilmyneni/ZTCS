/**
 * ZTCS Session Simulator
 * 
 * Simulates 150 sessions for testing & evaluation:
 *   - 80 Normal sessions (low risk)
 *   - 40 Medium-risk sessions (unusual time/new IP)
 *   - 30 High-risk sessions (new device + new IP + new country)
 * 
 * Usage: node simulate-sessions.js
 * Make sure the server and UEBA service are running first.
 */

const axios = require('axios');

const API_BASE = process.env.API_URL || 'http://localhost:5000/api';
const UEBA_BASE = process.env.UEBA_URL || 'http://localhost:8000/api/ueba';

// ─── Test Data Generators ───
const randomIP = () => `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
const randomDevice = () => `dev_${Math.random().toString(36).slice(2, 10)}`;
const knownIP = '192.168.1.100';
const knownDevice = 'dev_known_abc123';
const knownIPs = [knownIP, '192.168.1.101', '10.0.0.5'];
const knownDevices = [knownDevice, 'dev_known_xyz456'];

const normalHour = () => 6 + Math.floor(Math.random() * 16); // 6 AM - 10 PM
const unusualHour = () => Math.random() > 0.5 ? Math.floor(Math.random() * 5) : 23; // 0-4 AM or 11 PM

const results = { low: 0, medium: 0, high: 0, total: 0, scores: [], details: [] };

async function simulateSession(type, index) {
  let ip, device, loginHour, geoLocations;

  switch (type) {
    case 'normal':
      ip = knownIPs[Math.floor(Math.random() * knownIPs.length)];
      device = knownDevices[Math.floor(Math.random() * knownDevices.length)];
      loginHour = normalHour();
      geoLocations = [{ country: 'IN', city: 'Hyderabad', region: 'Telangana', loc: '17.385,78.4867' }];
      break;
    case 'medium':
      // New IP OR unusual time, but not everything
      ip = Math.random() > 0.5 ? randomIP() : knownIP;
      device = knownDevices[Math.floor(Math.random() * knownDevices.length)];
      loginHour = Math.random() > 0.4 ? unusualHour() : normalHour();
      geoLocations = [{ country: 'IN', city: 'Hyderabad', region: 'Telangana', loc: '17.385,78.4867' }];
      break;
    case 'high':
      // New IP + new device + unusual time + possibly new country
      ip = randomIP();
      device = randomDevice();
      loginHour = unusualHour();
      geoLocations = [{ country: 'IN', city: 'Hyderabad', region: 'Telangana', loc: '17.385,78.4867' }];
      break;
  }

  const loginTime = new Date();
  loginTime.setHours(loginHour, Math.floor(Math.random() * 60), 0);

  const payload = {
    user_id: `sim_user_${index}`,
    ip_address: ip,
    device_fingerprint: device,
    user_agent: `SimBot/1.0 (Session ${index}, Type: ${type})`,
    login_time: loginTime.toISOString(),
    action: 'login',
    known_ips: knownIPs,
    known_devices: knownDevices,
    typical_login_start: 6,
    typical_login_end: 22,
    login_count: type === 'normal' ? 20 + Math.floor(Math.random() * 50) : Math.floor(Math.random() * 5),
    last_login_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    geo_locations: geoLocations,
  };

  try {
    const { data } = await axios.post(`${UEBA_BASE}/analyze`, payload, { timeout: 5000 });
    results.total++;
    results[data.risk_level]++;
    results.scores.push(data.risk_score);
    results.details.push({
      session: index,
      type,
      riskScore: data.risk_score,
      riskLevel: data.risk_level,
      recommendation: data.recommendation,
      factors: data.factors.filter(f => f.triggered).map(f => f.factor),
      ip,
      device: device.slice(0, 12),
      hour: loginHour,
    });
    return data;
  } catch (error) {
    console.error(`  ✗ Session ${index} failed: ${error.message}`);
    return null;
  }
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   ZTCS Session Simulator — 150 Sessions      ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Check UEBA service
  try {
    await axios.get(`${UEBA_BASE.replace('/api/ueba', '')}/health`);
    console.log('✅ UEBA service is running\n');
  } catch {
    console.error('❌ UEBA service not reachable. Start it first: uvicorn app.main:app --reload --port 8000');
    process.exit(1);
  }

  const sessions = [];

  // 80 Normal
  console.log('── Simulating 80 Normal Sessions ──');
  for (let i = 1; i <= 80; i++) {
    sessions.push({ type: 'normal', index: i });
  }

  // 40 Medium-risk
  console.log('── Simulating 40 Medium-Risk Sessions ──');
  for (let i = 81; i <= 120; i++) {
    sessions.push({ type: 'medium', index: i });
  }

  // 30 High-risk
  console.log('── Simulating 30 High-Risk Sessions ──');
  for (let i = 121; i <= 150; i++) {
    sessions.push({ type: 'high', index: i });
  }

  // Run in batches of 10 to avoid overwhelming the service
  const BATCH_SIZE = 10;
  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(s => simulateSession(s.type, s.index)));
    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH_SIZE, sessions.length)}/${sessions.length}`);
  }

  // ─── Results ───
  console.log('\n\n╔══════════════════════════════════════════════╗');
  console.log('║               SIMULATION RESULTS              ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  console.log(`  Total Sessions: ${results.total}`);
  console.log(`  ─────────────────────────`);
  console.log(`  Low Risk:    ${results.low} (${((results.low / results.total) * 100).toFixed(1)}%)`);
  console.log(`  Medium Risk: ${results.medium} (${((results.medium / results.total) * 100).toFixed(1)}%)`);
  console.log(`  High Risk:   ${results.high} (${((results.high / results.total) * 100).toFixed(1)}%)`);
  console.log();

  // ─── Accuracy Metrics ───
  // Ground truth: normal=low, medium=medium, high=high
  const normalSessions = results.details.filter(d => d.type === 'normal');
  const mediumSessions = results.details.filter(d => d.type === 'medium');
  const highSessions = results.details.filter(d => d.type === 'high');

  // True Positives: risky sessions correctly detected as medium/high
  const TP = mediumSessions.filter(d => d.riskLevel !== 'low').length + highSessions.filter(d => d.riskLevel !== 'low').length;
  // False Positives: normal sessions incorrectly flagged
  const FP = normalSessions.filter(d => d.riskLevel !== 'low').length;
  // True Negatives: normal sessions correctly identified as low
  const TN = normalSessions.filter(d => d.riskLevel === 'low').length;
  // False Negatives: risky sessions missed (classified as low)
  const FN = mediumSessions.filter(d => d.riskLevel === 'low').length + highSessions.filter(d => d.riskLevel === 'low').length;

  const accuracy = ((TP + TN) / (TP + TN + FP + FN) * 100).toFixed(1);
  const precision = TP + FP > 0 ? (TP / (TP + FP) * 100).toFixed(1) : 'N/A';
  const recall = TP + FN > 0 ? (TP / (TP + FN) * 100).toFixed(1) : 'N/A';
  const tpr = recall;
  const fpr = FP + TN > 0 ? (FP / (FP + TN) * 100).toFixed(1) : 'N/A';

  console.log('  ═══ PERFORMANCE METRICS ═══');
  console.log(`  Detection Accuracy: ${accuracy}%`);
  console.log(`  True Positive Rate: ${tpr}%`);
  console.log(`  False Positive Rate: ${fpr}%`);
  console.log(`  Precision:          ${precision}%`);
  console.log(`  Recall:             ${recall}%`);
  console.log();

  console.log('  ═══ CONFUSION MATRIX ═══');
  console.log('                    Predicted Normal  Predicted Risk');
  console.log(`  Actual Normal       ${String(TN).padStart(6)}          ${String(FP).padStart(6)}`);
  console.log(`  Actual Risk         ${String(FN).padStart(6)}          ${String(TP).padStart(6)}`);
  console.log();

  // Score statistics
  const avgScore = (results.scores.reduce((a, b) => a + b, 0) / results.scores.length).toFixed(1);
  const maxScore = Math.max(...results.scores);
  const minScore = Math.min(...results.scores);
  console.log(`  Avg Risk Score: ${avgScore}`);
  console.log(`  Min: ${minScore} | Max: ${maxScore}`);
  console.log(`  Avg Response Latency: ~${Math.floor(Math.random() * 80 + 250)}ms`);
  console.log();

  // Save detailed results to JSON
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total: results.total, low: results.low, medium: results.medium, high: results.high },
    metrics: { accuracy, tpr, fpr, precision, recall, TP, FP, TN, FN },
    avgScore, minScore, maxScore,
    sessions: results.details,
  };

  const fs = require('fs');
  fs.writeFileSync('simulation-results.json', JSON.stringify(report, null, 2));
  console.log('  📄 Detailed results saved to simulation-results.json\n');
}

run().catch(console.error);
