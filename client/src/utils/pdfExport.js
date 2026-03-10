import jsPDF from 'jspdf';
import 'jspdf-autotable';

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

    doc.autoTable({
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

    doc.autoTable({
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

    doc.autoTable({
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
