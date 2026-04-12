import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generate a styled PDF security audit report.
 * @param {Object} params
 * @param {Object} params.stats - Dashboard stats
 * @param {Array} params.logs - Audit log entries
 * @param {Array} params.users - User list
 */
export const generateAuditPDF = ({ stats, logs, users }) => {
  const doc = new jsPDF();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });

  // ─── Header ───
  doc.setFillColor(10, 10, 15);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(240, 240, 245);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('ZTCS Security Audit Report', 14, 22);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 170);
  doc.text(`Generated: ${dateStr} at ${timeStr} IST`, 14, 32);
  doc.text('Zero Trust Cloud System', 196, 32, { align: 'right' });

  let y = 50;

  // ─── Overview Stats ───
  doc.setTextColor(60, 60, 80);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Overview (Last 24 Hours)', 14, y);
  y += 8;

  if (stats) {
    const statRows = [
      ['Total Users', String(stats.totalUsers || 0)],
      ['Total Files', String(stats.totalFiles || 0)],
      ['Logins (24h)', String(stats.recentLogins || 0)],
      ['Blocked Sessions (24h)', String(stats.blockedSessions || 0)],
      ['Step-Ups (24h)', String(stats.stepUps || 0)],
      ['Risk: Low', String(stats.riskDistribution?.low || 0)],
      ['Risk: Medium', String(stats.riskDistribution?.medium || 0)],
      ['Risk: High', String(stats.riskDistribution?.high || 0)],
    ];

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: statRows,
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 35], textColor: [200, 200, 220], fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [60, 60, 80] },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      margin: { left: 14, right: 14 },
      tableWidth: 80,
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ─── User Summary ───
  if (users && users.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 80);
    doc.text('User Summary', 14, y);
    y += 4;

    const userRows = users.slice(0, 20).map(u => [
      u.email,
      u.role,
      u.isBlocked ? 'BLOCKED' : 'Active',
      String(u.currentRiskScore || 0),
      u.currentRiskLevel || 'none',
      String(u.loginCount || 0),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Email', 'Role', 'Status', 'Risk', 'Level', 'Logins']],
      body: userRows,
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 35], textColor: [200, 200, 220], fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: [60, 60, 80] },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        3: { halign: 'center' },
        5: { halign: 'center' },
      },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ─── Recent Audit Logs ───
  if (logs && logs.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 80);
    doc.text('Recent Audit Logs', 14, y);
    y += 4;

    const logRows = logs.slice(0, 50).map(l => [
      new Date(l.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      l.user?.email || 'N/A',
      l.action.replace(/_/g, ' '),
      l.ipAddress || '',
      String(l.riskScore || ''),
      l.riskLevel || '',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Time', 'User', 'Action', 'IP', 'Score', 'Risk']],
      body: logRows,
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 35], textColor: [200, 200, 220], fontSize: 7 },
      bodyStyles: { fontSize: 6.5, textColor: [60, 60, 80] },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 35 },
        4: { halign: 'center', cellWidth: 15 },
        5: { halign: 'center', cellWidth: 15 },
      },
    });
  }

  // ─── Footer on each page ───
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 170);
    doc.text(
      `ZTCS Audit Report \u2014 Page ${i} of ${pageCount} \u2014 Confidential`,
      105, 290, { align: 'center' }
    );
  }

  doc.save(`ZTCS_Audit_Report_${now.toISOString().slice(0, 10)}.pdf`);
};

/**
 * Generate a per-user activity report PDF.
 * @param {Object} params
 * @param {Object} params.user - User info (email, name, role, createdAt)
 * @param {Object} params.activity - Activity stats
 * @param {Array} params.riskHistory - Risk score history entries
 * @param {Array} params.recentLogs - Recent audit log entries
 */
export const generateUserActivityPDF = ({ user, activity, riskHistory, recentLogs }) => {
  const doc = new jsPDF();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });

  // ─── Header ───
  doc.setFillColor(10, 10, 15);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(240, 240, 245);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('User Activity Report', 14, 22);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 170);
  doc.text(`Generated: ${dateStr} at ${timeStr} IST`, 14, 32);
  doc.text('Zero Trust Cloud System', 196, 32, { align: 'right' });

  let y = 50;

  // ─── User Info ───
  doc.setTextColor(60, 60, 80);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('User Information', 14, y);
  y += 4;

  const userRows = [
    ['Name', user.name || 'N/A'],
    ['Email', user.email],
    ['Role', user.role || 'user'],
    ['Status', user.isBlocked ? 'BLOCKED' : 'Active'],
    ['Account Created', user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN') : 'N/A'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Field', 'Value']],
    body: userRows,
    theme: 'grid',
    headStyles: { fillColor: [20, 20, 35], textColor: [200, 200, 220], fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [60, 60, 80] },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    margin: { left: 14, right: 14 },
    tableWidth: 100,
  });
  y = doc.lastAutoTable.finalY + 12;

  // ─── Activity Summary ───
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Activity Summary', 14, y);
  y += 4;

  const actRows = [
    ['Total Logins', String(activity.totalLogins || 0)],
    ['File Uploads', String(activity.fileUploads || 0)],
    ['File Downloads', String(activity.fileDownloads || 0)],
    ['File Deletes', String(activity.fileDeletes || 0)],
    ['Current Files', String(activity.fileCount || 0)],
    ['Security Events', String(activity.securityEvents || 0)],
    ['Avg Risk Score', String(activity.avgRiskScore || 0)],
    ['Known Devices', String(activity.knownDevices || activity.activeDevices || 0)],
    ['Known IPs', String(activity.knownIPs || 0)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: actRows,
    theme: 'grid',
    headStyles: { fillColor: [20, 20, 35], textColor: [200, 200, 220], fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [60, 60, 80] },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    margin: { left: 14, right: 14 },
    tableWidth: 100,
  });
  y = doc.lastAutoTable.finalY + 12;

  // ─── Risk Score Timeline ───
  if (riskHistory && riskHistory.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 80);
    doc.text('Risk Score Timeline', 14, y);
    y += 4;

    const riskRows = riskHistory.map(r => [
      r.timestamp ? new Date(r.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A',
      String(r.score),
      r.level,
      (r.factors || []).join(', ') || '-',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Time', 'Score', 'Level', 'Factors']],
      body: riskRows,
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 35], textColor: [200, 200, 220], fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: [60, 60, 80] },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { halign: 'center', cellWidth: 15 },
        2: { halign: 'center', cellWidth: 18 },
      },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ─── Recent Audit Logs ───
  if (recentLogs && recentLogs.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 80);
    doc.text('Recent Activity Logs', 14, y);
    y += 4;

    const logRows = recentLogs.slice(0, 30).map(l => [
      new Date(l.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      l.action.replace(/_/g, ' '),
      l.ipAddress || '',
      String(l.riskScore || ''),
      l.riskLevel || '',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Time', 'Action', 'IP', 'Score', 'Risk']],
      body: logRows,
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 35], textColor: [200, 200, 220], fontSize: 7 },
      bodyStyles: { fontSize: 6.5, textColor: [60, 60, 80] },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 35 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'center', cellWidth: 15 },
      },
    });
  }

  // ─── Footer ───
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 170);
    doc.text(
      `ZTCS User Report \u2014 ${user.email} \u2014 Page ${i} of ${pageCount} \u2014 Confidential`,
      105, 290, { align: 'center' }
    );
  }

  doc.save(`ZTCS_User_Report_${user.email.split('@')[0]}_${now.toISOString().slice(0, 10)}.pdf`);
};
