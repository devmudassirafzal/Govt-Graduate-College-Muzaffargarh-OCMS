import { useEffect, useState } from 'react';
import api from '../../../api/client';
import { Card, Table, Button, Field, Select, Input, useFlash, errText } from '../../../components/ui';

import ExaminationsTable from './ExaminationsTable';

export default function ExaminerSlips() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [students, setStudents] = useState([]);
  const [slips, setSlips] = useState({});
  const [searchQ, setSearchQ] = useState('');
  const [flash, flashEl] = useFlash();

  useEffect(() => {
    api.get('/examiner/exams').then(r => {
      setExams(r.data.exams);
      const active = r.data.exams.filter(e => e.isActive);
      if (active.length > 0) setExamId(active[0].id.toString());
    });
  }, []);

  const loadStudents = (currentExamId, q) => {
    if (!currentExamId) return;
    const params = q ? { q } : {};
    api.get(`/examiner/exams/${currentExamId}/students`, { params }).then(r => {
      setStudents(r.data.students || []);
      setSlips(r.data.generatedSlips || {});
    });
  };

  useEffect(() => {
    loadStudents(examId, '');
  }, [examId]);

  async function generate(studentId) {
    try {
      const res = await api.post(`/examiner/exams/${examId}/slips`, { studentId });
      setSlips(prev => ({ ...prev, [studentId]: res.data.slip }));
      flash({ type: 'ok', text: 'Slip generated successfully.' });
    } catch (e) { flash({ type: 'error', text: errText(e) }); }
  }

  async function notify(studentId) {
    try {
      await api.post(`/examiner/students/notify-unpaid`, { studentId });
      flash({ type: 'ok', text: 'Notification sent to student.' });
    } catch (e) { flash({ type: 'error', text: errText(e) }); }
  }

  async function toggle(id) {
    await api.put(`/examiner/exams/${id}/toggle`).catch(e => flash({ type: 'error', text: errText(e) }));
    api.get('/examiner/exams').then(r => setExams(r.data.exams));
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/examiner/exams/${id}`);
      flash({ type: 'ok', text: 'Examination deleted.' });
      api.get('/examiner/exams').then(r => {
        setExams(r.data.exams);
        if (examId === String(id)) setExamId('');
      });
    } catch (e) { flash({ type: 'error', text: errText(e) }); }
  }

  return (
    <div className="space-y-6">
      {flashEl}
      <h1 className="text-2xl font-bold text-slate-900">Roll Number Slips</h1>

      <Card title="Active Examinations" className="mb-8">
        <ExaminationsTable exams={exams.filter(e => e.isActive)} onToggle={toggle} onDelete={handleDelete} />
      </Card>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Select Active Exam">
            <Select value={examId} onChange={e => setExamId(e.target.value)}>
              <option value="">Select Exam...</option>
              {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="Search Students (Roll # or Name)">
            <div className="flex gap-2">
              <Input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Type roll # or student name..."
                onKeyDown={e => { if (e.key === 'Enter') loadStudents(examId, searchQ); }}
              />
              <Button variant="outline" onClick={() => loadStudents(examId, searchQ)}>Search</Button>
            </div>
          </Field>
        </div>
      </Card>

      {examId && (
        <Card title="Students">
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <th>Roll #</th>
                  <th>Name</th>
                  <th>Program</th>
                  <th>Fee Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400 italic">No students found matching the criteria.</td>
                  </tr>
                ) : students.map(s => {
                  const slip = slips[s.id];
                  const hasUnpaid = Boolean(s.hasUnpaidFees ?? s.has_unpaid_fees);
                  return (
                    <tr key={s.id}>
                      <td className="font-mono text-slate-600">{s.rollNumber}</td>
                      <td className="font-medium text-slate-800">{s.name}</td>
                      <td>{s.program?.name || 'N/A'} Sem {s.classSection?.termNo} ({s.classSection?.shift})</td>
                      <td>
                        {hasUnpaid ? (
                          <span className="rounded-full bg-red-100 text-red-800 px-2 py-1 text-xs font-semibold">Unpaid Challans</span>
                        ) : (
                          <span className="rounded-full bg-green-100 text-green-800 px-2 py-1 text-xs font-semibold">Cleared</span>
                        )}
                      </td>
                      <td className="text-right space-x-2">
                        {slip ? (
                          <span className="text-sm text-slate-500 mr-2">Generated</span>
                        ) : hasUnpaid ? (
                          <Button variant="outline" size="sm" onClick={() => notify(s.id)} className="text-orange-600 border-orange-200 hover:bg-orange-50">
                            Notify Unpaid
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => generate(s.id)}>Generate Slip</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
