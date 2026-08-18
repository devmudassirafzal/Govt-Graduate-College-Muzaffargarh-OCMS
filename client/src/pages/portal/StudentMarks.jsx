import { useEffect, useState } from 'react';
import api from '../../api/client';
import { Card, Table, Badge, fmtDate } from '../../components/ui';

export default function StudentMarks() {
  const [marks, setMarks] = useState(null);

  useEffect(() => {
    api.get('/assessments/mine').then((r) => setMarks(r.data.marks));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">My Marks</h1>
      <p className="text-sm text-slate-500">Only marks published by your teachers appear here.</p>
      <Card>
        <Table
          columns={[
            { header: 'Subject', cell: (m) => m.subject },
            { header: 'Assessment', cell: (m) => m.title },
            { header: 'Type', cell: (m) => <Badge value={m.type} /> },
            { header: 'Held', cell: (m) => fmtDate(m.heldOn) },
            { header: 'Marks', cell: (m) => m.obtained === null ? <Badge value="absent" /> : <span className="font-semibold text-primary">{Number(m.obtained)} / {m.total}</span> },
          ]}
          rows={marks ?? []}
          empty={marks === null ? 'Loading…' : 'No published marks yet.'}
        />
      </Card>
    </div>
  );
}
