export async function saveReport(db,report){await db.prepare("INSERT INTO reports(id,workspace_id,created_at,decision,transaction_digest,report_raw) VALUES(?,?,?,?,?,?)").bind(report.id,report.workspaceId,report.createdAt,report.decision,report.transactionDigest,JSON.stringify(report)).run();}
export async function getReport(db,id){const row=await db.prepare("SELECT report_raw FROM reports WHERE id=?").bind(id).first();return row?JSON.parse(row.report_raw):null;}
export async function listReports(db,workspace){const rows=await db.prepare("SELECT report_raw FROM reports WHERE workspace_id=? ORDER BY created_at DESC LIMIT 30").bind(workspace).all();return(rows.results||[]).map(x=>JSON.parse(x.report_raw));}

