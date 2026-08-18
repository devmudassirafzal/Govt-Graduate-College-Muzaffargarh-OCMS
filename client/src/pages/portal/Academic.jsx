import { useEffect, useState } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Card, Table, Badge, Button, Input, Select, Modal, Field, Textarea, useFlash, errText, fmtDate } from '../../components/ui';

const TABS = ['Departments', 'Programs', 'Subjects', 'Class Shifts', 'Allocations', 'Sessions', 'Cycles', 'Designations', 'Inter-Groups', 'Document Types'];

export default function Academic() {
  const { user, can } = useAuth();
  const canNominateHod = user.roles.includes('admin') || user.roles.includes('principal');
  // academic.view = read-only browsing; edits need academic.manage (departments
  // have their own departments.manage permission).
  const canManage = can('academic.manage');
  const canDept = can('departments.manage');
  const [tab, setTab] = useState('Departments');
  const [data, setData] = useState({});
  const [modal, setModal] = useState(null);   // 'department' | 'program' | etc.
  const [editItem, setEditItem] = useState(null); // null = create, object = edit
  const [form, setForm] = useState({});
  const [deleting, setDeleting] = useState(null); // url currently being deleted
  // Subjects tab is browsed as a sequence: program → session → semester.
  const [subjFilter, setSubjFilter] = useState({ programId: '', sessionId: '', termNo: '' });
  const [flash, flashEl] = useFlash();

  const load = async () => {
    const [dep, prog, subj, sect, alloc, sess, cyc, groups, teach, desig, docs] = await Promise.all([
      api.get('/academic/departments'), api.get('/academic/programs'), api.get('/academic/subjects'),
      api.get('/academic/sections'), api.get('/academic/allocations'), api.get('/academic/sessions'),
      api.get('/academic/cycles'), api.get('/academic/inter-groups'), api.get('/teachers', { params: { all: 1 } }),
      api.get('/academic/designations'), api.get('/academic/document-types'),
    ]);
    setData({
      departments: dep.data.departments, programs: prog.data.programs, subjects: subj.data.subjects,
      sections: sect.data.sections, allocations: alloc.data.allocations, sessions: sess.data.sessions,
      cycles: cyc.data.cycles, interGroups: groups.data.interGroups, teachers: teach.data.teachers,
      designations: desig.data.designations, documentTypes: docs.data.documentTypes,
    });
  };
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function openCreate(modalName, defaults = {}) {
    setEditItem(null);
    setForm(defaults);
    setModal(modalName);
  }

  function openEdit(modalName, item) {
    setEditItem(item);
    setForm({ ...item });
    setModal(modalName);
  }

  async function submit(createUrl, updateUrl, body, label) {
    try {
      if (editItem) {
        await api.put(updateUrl, body);
        flash({ type: 'ok', text: `${label} updated.` });
      } else {
        await api.post(createUrl, body);
        flash({ type: 'ok', text: `${label} added.` });
      }
      setModal(null); setForm({}); setEditItem(null); load();
    } catch (e) { flash({ type: 'error', text: errText(e) }); }
  }

  // Instant single-item delete (no confirm, per UX prefs); FK-protected server-side.
  async function del(url, label) {
    setDeleting(url);
    try {
      await api.delete(url);
      flash({ type: 'ok', text: `${label} deleted.` });
      await load();
    } catch (e) { flash({ type: 'error', text: errText(e) }); }
    finally { setDeleting(null); }
  }

  const d = data;
  if (!d.departments) return <div className="py-20 text-center text-slate-400">Loading…</div>;

  // ── Cycle modal helpers: BS batches run 4 years, Intermediate 2. The clerk
  // types only the session START year — the end year is auto-completed from the
  // level's span; the server reuses the matching session or creates it.
  // Dates are date-only: the cycle opens at 00:00 and closes at 23:59 local.
  const localDateStr = (dt) => dt.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const cycleSpan = form.level === 'intermediate' ? 2 : 4;
  const parseSessionText = (text) => {
    const m = /^\s*(\d{4})\s*[-–]\s*(\d{4})\s*$/.exec(text ?? '');
    return m ? { startYear: Number(m[1]), endYear: Number(m[2]) } : null;
  };
  const cycleSessionYears = parseSessionText(form.sessionName);
  // Existing sessions with the right span, offered as type-ahead suggestions.
  const cycleSessionSuggestions = (d.sessions ?? [])
    .filter((s) => Number(s.endYear) - Number(s.startYear) === cycleSpan)
    .map((s) => `${s.startYear}-${s.endYear}`);
  const cycleAutoTitle = (level, startYear) =>
    startYear ? `${level === 'intermediate' ? 'Intermediate' : 'BS'} Admissions ${startYear}` : '';
  const isAutoTitle = (t) => !t || /^(BS|Intermediate) Admissions \d{4}$/.test(t);

  const onCycleLevel = (e) => {
    const level = e.target.value;
    const span = level === 'intermediate' ? 2 : 4;
    // Level switch re-derives the end year (BS 4 / Inter 2) from the same start year.
    const years = parseSessionText(form.sessionName);
    const sessionName = years ? `${years.startYear}-${years.startYear + span}` : form.sessionName;
    setForm({
      ...form,
      level,
      sessionName,
      title: isAutoTitle(form.title) ? cycleAutoTitle(level, years?.startYear) : form.title,
    });
  };
  const onCycleSession = (e) => {
    let text = e.target.value;
    const prev = form.sessionName ?? '';
    // Typed the 4-digit start year → auto-complete the end year for this level
    // (only while typing forward, so backspacing doesn't fight the user).
    if (form.level && /^\d{4}$/.test(text) && text.length > prev.length) {
      text = `${text}-${Number(text) + cycleSpan}`;
    }
    setForm({
      ...form,
      sessionName: text,
      title: isAutoTitle(form.title) ? cycleAutoTitle(form.level, parseSessionText(text)?.startYear) : form.title,
    });
  };
  const cycleSessionError = !form.level ? null
    : !form.sessionName?.trim() ? 'Type the session start year (e.g. ' + `${new Date().getFullYear()}) — the end year fills in automatically.`
    : !cycleSessionYears ? 'Session must be two years like 2026-2030 (start-end).'
    : cycleSessionYears.endYear - cycleSessionYears.startYear !== cycleSpan
      ? `${form.level === 'bs' ? 'BS' : 'Intermediate'} programs run ${cycleSpan} years — ${cycleSessionYears.startYear}-${cycleSessionYears.endYear} spans ${cycleSessionYears.endYear - cycleSessionYears.startYear}. Use ${cycleSessionYears.startYear}-${cycleSessionYears.startYear + cycleSpan}.`
      : null;
  const cycleErrors = modal === 'cycle' ? [
    !form.level && 'Select a level (Intermediate or BS).',
    !editItem && cycleSessionError,
    form.level && (!form.title || form.title.trim().length < 3) && 'Enter a title (at least 3 characters).',
    !form.startAt && 'Set the opening date.',
    !form.endAt && 'Set the closing date.',
    form.startAt && form.endAt && form.endAt < form.startAt && 'The closing date must be on or after the opening date.',
  ].filter(Boolean) : [];
  // Date-only fields → real datetimes: open at 00:00, close at 23:59 (local).
  const cycleSubmitBody = () => ({
    ...form,
    startAt: form.startAt ? `${form.startAt}T00:00` : form.startAt,
    endAt: form.endAt ? `${form.endAt}T23:59` : form.endAt,
  });

  const RowActions = ({ onEdit, deleteUrl, label, allowed = canManage }) => allowed ? (
    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
      <Button variant="outline" onClick={onEdit}>Edit</Button>
      <Button variant="danger" disabled={deleting === deleteUrl} onClick={() => del(deleteUrl, label)}>
        {deleting === deleteUrl ? 'Deleting…' : 'Delete'}
      </Button>
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      {flashEl}
      <h1 className="text-2xl font-bold text-slate-900">Academic Structure</h1>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === t ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Departments ──────────────────────────────────────────── */}
      {tab === 'Departments' && (
        <Card title="Departments" actions={canDept && <Button onClick={() => openCreate('department', {})}>+ Add</Button>}>
          <Table columns={[
            { header: 'Code', cell: (x) => <span className="font-semibold text-primary">{x.code}</span> },
            { header: 'Name', cell: (x) => x.name },
            { header: 'HOD', cell: (x) => x.hod?.name ?? '—' },
            { header: 'Teachers', cell: (x) => x._count.teachers },
            { header: 'Programs', cell: (x) => x._count.programs },
            { header: 'Actions', cell: (x) => <RowActions allowed={canDept} onEdit={() => openEdit('department', x)} deleteUrl={`/academic/departments/${x.id}`} label="Department" /> },
          ]} rows={d.departments} />
        </Card>
      )}

      {/* ── Programs ─────────────────────────────────────────────── */}
      {tab === 'Programs' && (
        <Card title="Programs (BS + Intermediate)" actions={canManage && <Button onClick={() => openCreate('program', { level: 'bs', durationYears: 4, totalSemesters: 8, seats: 50, minPercentage: 60, eligibleGroupIds: [] })}>+ Add</Button>}>
          <Table columns={[
            { header: 'Code', cell: (x) => <span className="font-semibold text-primary">{x.code}</span> },
            { header: 'Name', cell: (x) => x.name },
            { header: 'Level', cell: (x) => <Badge value={x.level} /> },
            { header: 'Seats', cell: (x) => x.seats },
            { header: 'Min %', cell: (x) => Number(x.minPercentage) },
            { header: 'Eligible groups', cell: (x) => x.level === 'bs' ? x.eligibilities.map((e) => e.interGroup.code).join(', ') : x.interGroup?.name ?? '—' },
            { header: 'Active', cell: (x) => <Badge value={x.isActive ? 'active' : 'closed'} /> },
            { header: 'Actions', cell: (x) => <RowActions onEdit={() => openEdit('program', { ...x, eligibleGroupIds: x.eligibilities.map((e) => e.interGroupId) })} deleteUrl={`/academic/programs/${x.id}`} label="Program" /> },
          ]} rows={d.programs} />
        </Card>
      )}

      {/* ── Subjects (browsed by program → session → semester) ────── */}
      {tab === 'Subjects' && (() => {
        // Sessions that this program actually runs (via its class shifts); fall back to all sessions.
        const progSessions = [
          ...new Map(
            d.sections
              .filter((s) => String(s.programId) === String(subjFilter.programId))
              .map((s) => [s.academicSession.id, s.academicSession]),
          ).values(),
        ];
        const sessionOptions = progSessions.length ? progSessions : d.sessions;
        const progSubjects = d.subjects.filter((s) => String(s.programId) === String(subjFilter.programId));
        // A session/batch only runs the semester(s) it actually has class shifts for — so
        // the semester list comes from that session's sections, not the whole 1–8 curriculum.
        // (Falls back to the full curriculum if the session has no class shifts yet.)
        const sessionSemesters = [...new Set(
          d.sections
            .filter((s) => String(s.programId) === String(subjFilter.programId) && String(s.academicSessionId) === String(subjFilter.sessionId))
            .map((s) => s.termNo),
        )].sort((a, b) => a - b);
        const allProgSemesters = [...new Set(progSubjects.map((s) => s.termNo))].sort((a, b) => a - b);
        const semesters = subjFilter.sessionId && sessionSemesters.length ? sessionSemesters : allProgSemesters;
        const ready = subjFilter.programId && subjFilter.sessionId;
        const shown = progSubjects
          .filter((s) => semesters.includes(s.termNo)) // limit to the selected session's semesters
          .filter((s) => !subjFilter.termNo || String(s.termNo) === String(subjFilter.termNo))
          .sort((a, b) => a.termNo - b.termNo);

        return (
          <div className="space-y-4">
            <Card title="Browse subjects">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="1. Program">
                  <Select
                    value={subjFilter.programId}
                    onChange={(e) => setSubjFilter({ programId: e.target.value, sessionId: '', termNo: '' })}
                  >
                    <option value="">Select program…</option>
                    {d.programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                  </Select>
                </Field>
                <Field label="2. Session">
                  <Select
                    value={subjFilter.sessionId}
                    onChange={(e) => setSubjFilter({ ...subjFilter, sessionId: e.target.value, termNo: '' })}
                    disabled={!subjFilter.programId}
                  >
                    <option value="">{subjFilter.programId ? 'Select session…' : 'Pick a program first'}</option>
                    {sessionOptions.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.shift})</option>)}
                  </Select>
                </Field>
                <Field label="3. Semester">
                  <Select
                    value={subjFilter.termNo}
                    onChange={(e) => setSubjFilter({ ...subjFilter, termNo: e.target.value })}
                    disabled={!ready}
                  >
                    <option value="">All semesters</option>
                    {semesters.map((t) => <option key={t} value={t}>Semester {t}</option>)}
                  </Select>
                </Field>
              </div>
            </Card>

            <Card
              title={ready ? `Subjects — ${d.programs.find((p) => String(p.id) === String(subjFilter.programId))?.code}${subjFilter.termNo ? ` · Semester ${subjFilter.termNo}` : ' · all semesters'}` : 'Subjects'}
              actions={canManage && (
                <Button
                  onClick={() => openCreate('subject', {
                    programId: subjFilter.programId || '',
                    termNo: subjFilter.termNo || 1,
                  })}
                >
                  + Add
                </Button>
              )}
            >
              {ready ? (
                <Table columns={[
                  { header: 'Semester', cell: (x) => <span className="font-semibold text-slate-700">Sem {x.termNo}</span> },
                  { header: 'Code', cell: (x) => <span className="font-semibold text-primary">{x.code}</span> },
                  { header: 'Title', cell: (x) => x.title },
                  { header: 'Credits', cell: (x) => x.creditHours ?? '—' },
                  { header: 'Actions', cell: (x) => <RowActions onEdit={() => openEdit('subject', x)} deleteUrl={`/academic/subjects/${x.id}`} label="Subject" /> },
                ]} rows={shown} empty="No subjects for this program yet — use + Add to create them semester by semester." />
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">
                  Choose a program and a session above to see its subjects in semester order.
                </p>
              )}
            </Card>
          </div>
        );
      })()}

      {/* ── Class shifts ─────────────────────────────────────────── */}
      {tab === 'Class Shifts' && (
        <Card title="Class Shifts" actions={canManage && <Button onClick={() => openCreate('section', { termNo: 1, shift: 'morning', capacity: 50 })}>+ Add</Button>}>
          <Table columns={[
            { header: 'Program', cell: (x) => x.program.code },
            { header: 'Session', cell: (x) => x.academicSession.name },
            { header: 'Semester', cell: (x) => x.termNo },
            { header: 'Shift', cell: (x) => <span className="font-semibold capitalize">{x.shift}</span> },
            { header: 'Students', cell: (x) => `${x._count.students}/${x.capacity ?? '∞'}` },
            { header: 'Actions', cell: (x) => <RowActions onEdit={() => openEdit('section', { ...x, programId: x.programId, academicSessionId: x.academicSessionId })} deleteUrl={`/academic/sections/${x.id}`} label="Class shift" /> },
          ]} rows={d.sections} />
        </Card>
      )}

      {/* ── Allocations ──────────────────────────────────────────── */}
      {tab === 'Allocations' && (
        <Card title="Allocations — class shift + subject + teacher" actions={canManage && <Button onClick={() => openCreate('allocation', {})}>+ Add</Button>}>
          <Table columns={[
            { header: 'Class Shift', cell: (x) => `${x.classSection.program.code} Semester ${x.classSection.termNo} (${x.classSection.shift})` },
            { header: 'Subject', cell: (x) => x.subject.title },
            { header: 'Teacher', cell: (x) => x.teacher.name },
            {
              header: 'Actions',
              cell: (x) => (
                <RowActions
                  onEdit={() => openEdit('allocation', { ...x, classSectionId: x.classSectionId, subjectId: x.subjectId, teacherId: x.teacherId })}
                  deleteUrl={`/academic/allocations/${x.id}`}
                  label="Allocation"
                />
              )
            },
          ]} rows={d.allocations} />
        </Card>
      )}

      {/* ── Sessions ─────────────────────────────────────────────── */}
      {tab === 'Sessions' && (
        <Card title="Academic Sessions" actions={canManage && <Button onClick={() => openCreate('session', {})}>+ Add</Button>}>
          <Table columns={[
            { header: 'Name', cell: (x) => <span className="font-semibold">{x.name}</span> },
            { header: 'Years', cell: (x) => `${x.startYear}–${x.endYear}` },
            { header: 'Shift', cell: (x) => <Badge value={x.shift} /> },
            { header: 'Current', cell: (x) => x.isCurrent ? <Badge value="active" /> : '—' },
            { header: 'Actions', cell: (x) => <RowActions onEdit={() => openEdit('session', x)} deleteUrl={`/academic/sessions/${x.id}`} label="Session" /> },
          ]} rows={d.sessions} />
        </Card>
      )}

      {/* ── Cycles ───────────────────────────────────────────────── */}
      {tab === 'Cycles' && (
        <Card title="Admission Cycles" actions={canManage && <Button onClick={() => openCreate('cycle', { status: 'open', startAt: localDateStr(new Date()) })}>+ Add</Button>}>
          <Table columns={[
            { header: 'Title', cell: (x) => <span className="font-semibold">{x.title}</span> },
            { header: 'Level', cell: (x) => <Badge value={x.level} /> },
            { header: 'Session', cell: (x) => x.academicSession.name },
            { header: 'Window', cell: (x) => `${fmtDate(x.startAt)} → ${fmtDate(x.endAt)}` },
            { header: 'Status', cell: (x) => <Badge value={x.status} /> },
            { header: 'Actions', cell: (x) => <RowActions onEdit={() => openEdit('cycle', { ...x, startAt: x.startAt ? localDateStr(new Date(x.startAt)) : '', endAt: x.endAt ? localDateStr(new Date(x.endAt)) : '' })} deleteUrl={`/academic/cycles/${x.id}`} label="Admission cycle" /> },
          ]} rows={d.cycles} />
        </Card>
      )}

      {/* ── Designations ─────────────────────────────────────────── */}
      {tab === 'Designations' && (
        <Card title="Teacher Designations" actions={canManage && <Button onClick={() => openCreate('designation', {})}>+ Add</Button>}>
          <Table columns={[
            { header: 'Title', cell: (x) => <span className="font-semibold">{x.title}</span> },
            { header: 'Actions', cell: (x) => <RowActions onEdit={() => openEdit('designation', x)} deleteUrl={`/academic/designations/${x.id}`} label="Designation" /> },
          ]} rows={d.designations} empty="No designations yet — add e.g. Professor, Associate Professor, Lecturer. Needed before you can add teachers." />
        </Card>
      )}

      {/* ── Inter-Groups ─────────────────────────────────────────── */}
      {tab === 'Inter-Groups' && (
        <Card title="Intermediate Groups" actions={canManage && <Button onClick={() => openCreate('interGroup', {})}>+ Add</Button>}>
          <Table columns={[
            { header: 'Code', cell: (x) => <span className="font-semibold text-primary">{x.code}</span> },
            { header: 'Name', cell: (x) => x.name },
            { header: 'Actions', cell: (x) => <RowActions onEdit={() => openEdit('interGroup', x)} deleteUrl={`/academic/inter-groups/${x.id}`} label="Intermediate group" /> },
          ]} rows={d.interGroups} empty="No intermediate groups yet — add e.g. Pre-Medical, Pre-Engineering, ICS. Needed for intermediate programs and admissions." />
        </Card>
      )}

      {/* ── Document Types ───────────────────────────────────────── */}
      {tab === 'Document Types' && (
        <Card title="Admission Document Types" actions={canManage && <Button onClick={() => openCreate('documentType', { appliesTo: 'both', isRequired: true })}>+ Add</Button>}>
          <Table columns={[
            { header: 'Name', cell: (x) => <span className="font-semibold">{x.name}</span> },
            { header: 'Applies to', cell: (x) => <Badge value={x.appliesTo} /> },
            { header: 'Required', cell: (x) => x.isRequired ? <Badge value="required" /> : 'optional' },
            { header: 'Active', cell: (x) => x.isActive ? <Badge value="active" /> : 'inactive' },
            { header: 'Actions', cell: (x) => <RowActions onEdit={() => openEdit('documentType', x)} deleteUrl={`/academic/document-types/${x.id}`} label="Document type" /> },
          ]} rows={d.documentTypes} empty="No document types yet — add what applicants must upload (e.g. Matric Certificate, CNIC/B-Form). Required ones drive clerk verification." />
        </Card>
      )}

      {/* ────── Department modal ────── */}
      <Modal open={modal === 'department'} title={editItem ? 'Edit Department' : 'Add Department'} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name ?? ''} onChange={set('name')} /></Field>
          <Field label="Code"><Input value={form.code ?? ''} onChange={set('code')} disabled={!!editItem} /></Field>
          <Field label="Description"><Textarea value={form.description ?? ''} onChange={set('description')} /></Field>
          <Field
            label="Head of Department (HOD)"
            hint={canNominateHod
              ? 'One HOD per department; a teacher can head only one. The HOD gets portal access to manage this department\'s page, gallery, and students.'
              : 'Only the Principal or Admin can nominate or change a HOD.'}
          >
            <Select value={form.hodTeacherId ?? ''} onChange={set('hodTeacherId')} disabled={!canNominateHod}>
              <option value="">— No HOD —</option>
              {(d.teachers ?? []).filter((t) => t.status === 'active').map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.department?.code} · {t.designation?.title})</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => submit('/academic/departments', `/academic/departments/${editItem?.id}`, form, 'Department')}>
              {editItem ? 'Save Changes' : 'Add Department'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────── Program modal ────── */}
      <Modal open={modal === 'program'} wide title={editItem ? 'Edit Program' : 'Add Program'} onClose={() => setModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={form.name ?? ''} onChange={set('name')} /></Field>
          <Field label="Code"><Input value={form.code ?? ''} onChange={set('code')} disabled={!!editItem} /></Field>
          {!editItem && (
            <Field label="Level">
              <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value, durationYears: e.target.value === 'bs' ? 4 : 2, totalSemesters: e.target.value === 'bs' ? 8 : '', minPercentage: e.target.value === 'bs' ? 60 : 50 })}>
                <option value="bs">BS (4-year)</option><option value="intermediate">Intermediate</option>
              </Select>
            </Field>
          )}
          {(form.level === 'bs' || editItem?.level === 'bs') ? (
            <Field label="Department">
              <Select value={form.departmentId ?? ''} onChange={set('departmentId')}>
                <option value="">Select…</option>
                {d.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
          ) : (
            <Field label="Intermediate group">
              <Select value={form.interGroupId ?? ''} onChange={set('interGroupId')}>
                <option value="">Select…</option>
                {d.interGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Seats"><Input type="number" value={form.seats ?? ''} onChange={set('seats')} /></Field>
          <Field label="Minimum % (§6.1)"><Input type="number" value={form.minPercentage ?? ''} onChange={set('minPercentage')} /></Field>
          {editItem && (
            <Field label="Status">
              <Select value={form.isActive ? 'true' : 'false'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}>
                <option value="true">Active</option><option value="false">Closed</option>
              </Select>
            </Field>
          )}
          {(form.level === 'bs' || editItem?.level === 'bs') && (
            <div className="col-span-full">
              <span className="mb-1 block text-sm font-medium text-slate-700">Eligibility matrix — allowed intermediate groups (§6.2)</span>
              <div className="flex flex-wrap gap-3">
                {d.interGroups.map((g) => (
                  <label key={g.id} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={(form.eligibleGroupIds ?? []).includes(g.id)}
                      onChange={(e) => {
                        const cur = form.eligibleGroupIds ?? [];
                        setForm({ ...form, eligibleGroupIds: e.target.checked ? [...cur, g.id] : cur.filter((x) => x !== g.id) });
                      }} />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="col-span-full flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => submit('/academic/programs', `/academic/programs/${editItem?.id}`, form, 'Program')}>
              {editItem ? 'Save Changes' : 'Add Program'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────── Subject modal ────── */}
      <Modal open={modal === 'subject'} title={editItem ? 'Edit Subject' : 'Add Subject'} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Program">
            <Select value={form.programId ?? ''} onChange={set('programId')} disabled={!!editItem}>
              <option value="">Select…</option>
              {d.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Semester"><Input type="number" value={form.termNo ?? ''} onChange={set('termNo')} /></Field>
            <Field label="Credit hours"><Input type="number" value={form.creditHours ?? ''} onChange={set('creditHours')} /></Field>
          </div>
          <Field label="Title"><Input value={form.title ?? ''} onChange={set('title')} /></Field>
          <Field label="Code"><Input value={form.code ?? ''} onChange={set('code')} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => submit('/academic/subjects', `/academic/subjects/${editItem?.id}`, form, 'Subject')}>
              {editItem ? 'Save Changes' : 'Add Subject'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────── Class shift modal ────── */}
      <Modal open={modal === 'section'} title={editItem ? 'Edit Class Shift' : 'Add Class Shift'} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Program">
            <Select value={form.programId ?? ''} onChange={set('programId')} disabled={!!editItem}>
              <option value="">Select…</option>
              {d.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Session">
            <Select
              value={form.academicSessionId ?? ''}
              onChange={(e) => {
                const session = d.sessions.find((s) => String(s.id) === e.target.value);
                setForm({ ...form, academicSessionId: e.target.value, shift: session?.shift ?? form.shift ?? 'morning' });
              }}
              disabled={!!editItem}
            >
              <option value="">Select…</option>
              {d.sessions.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.shift})</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Semester"><Input type="number" value={form.termNo ?? ''} onChange={set('termNo')} /></Field>
            <Field label="Shift">
              <Select value={form.shift ?? 'morning'} onChange={set('shift')}>
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
              </Select>
            </Field>
          </div>
          <Field label="Capacity"><Input type="number" value={form.capacity ?? ''} onChange={set('capacity')} /></Field>
          {editItem && (
            <Field label="Status">
              <Select value={form.isActive ? 'true' : 'false'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}>
                <option value="true">Active</option><option value="false">Closed</option>
              </Select>
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => submit('/academic/sections', `/academic/sections/${editItem?.id}`, form, 'Class shift')}>
              {editItem ? 'Save Changes' : 'Add Class Shift'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────── Allocation modal ────── */}
      <Modal open={modal === 'allocation'} title={editItem ? 'Edit Allocation' : 'Add Allocation'} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Class shift">
            <Select value={form.classSectionId ?? ''} onChange={set('classSectionId')}>
              <option value="">Select…</option>
              {d.sections.map((s) => <option key={s.id} value={s.id}>{s.program.code} Semester {s.termNo} — {s.shift}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={form.subjectId ?? ''} onChange={set('subjectId')}>
              <option value="">Select…</option>
              {d.subjects
                .filter((s) => !form.classSectionId || s.programId === d.sections.find((x) => x.id === Number(form.classSectionId))?.programId)
                .map((s) => <option key={s.id} value={s.id}>{s.title} (Sem {s.termNo})</option>)}
            </Select>
          </Field>
          <Field label="Teacher (any department — §5.1)">
            <Select value={form.teacherId ?? ''} onChange={set('teacherId')}>
              <option value="">Select…</option>
              {d.teachers.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.department.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => submit('/academic/allocations', `/academic/allocations/${editItem?.id}`, form, 'Allocation')}>
              {editItem ? 'Save Changes' : 'Add Allocation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────── Session modal ────── */}
      <Modal open={modal === 'session'} title={editItem ? 'Edit Session' : 'Add Academic Session'} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Name (e.g. 2027-2031)"><Input value={form.name ?? ''} onChange={set('name')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start year"><Input type="number" value={form.startYear ?? ''} onChange={set('startYear')} /></Field>
            <Field label="End year"><Input type="number" value={form.endYear ?? ''} onChange={set('endYear')} /></Field>
          </div>
          {form.startYear && form.endYear && ![2, 4].includes(Number(form.endYear) - Number(form.startYear)) && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              A session must span <b>2 years</b> (Intermediate) or <b>4 years</b> (BS) — {form.startYear}-{form.endYear} spans {Number(form.endYear) - Number(form.startYear)}.
            </p>
          )}
          <Field label="Shift — this batch studies in">
            <Select value={form.shift ?? 'morning'} onChange={set('shift')}>
              <option value="morning">Morning</option>
              <option value="evening">Evening</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.isCurrent} onChange={set('isCurrent')} /> Mark as current session</label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => submit('/academic/sessions', `/academic/sessions/${editItem?.id}`, form, 'Session')}>
              {editItem ? 'Save Changes' : 'Add Session'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────── Cycle modal ────── */}
      <Modal open={modal === 'cycle'} title={editItem ? 'Edit Admission Cycle' : 'Add Admission Cycle'} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Level" hint={!editItem ? 'BS programs run 4 years; Intermediate (11th–12th) runs 2 years.' : undefined}>
            <Select value={form.level ?? ''} onChange={onCycleLevel} disabled={!!editItem}>
              <option value="">Select…</option>
              <option value="intermediate">Intermediate (2 years)</option>
              <option value="bs">BS (4 years)</option>
            </Select>
          </Field>
          {editItem ? (
            <Field label="Session">
              <Input value={editItem.academicSession ? `${editItem.academicSession.name} (${editItem.academicSession.startYear}–${editItem.academicSession.endYear})` : '—'} disabled />
            </Field>
          ) : (
            <Field
              label={`Session (${cycleSpan}-year ${form.level === 'intermediate' ? 'Intermediate' : 'BS'} batch)`}
              hint={form.level
                ? (cycleSessionError ?? `✓ ${cycleSessionYears.startYear}–${cycleSessionYears.endYear} — reused if it already exists, created otherwise.`)
                : 'Select a level first.'}
            >
              <Input
                value={form.sessionName ?? ''}
                onChange={onCycleSession}
                disabled={!form.level}
                placeholder={`Type the start year, e.g. ${new Date().getFullYear()}`}
                list="cycle-session-suggestions"
              />
              <datalist id="cycle-session-suggestions">
                {cycleSessionSuggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </Field>
          )}
          <Field label="Title"><Input value={form.title ?? ''} onChange={set('title')} placeholder="e.g. BS Admissions 2026" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opens" hint={!editItem ? 'Today by default — pick a future date to schedule the cycle.' : undefined}>
              <Input type="date" value={form.startAt ?? ''} onChange={set('startAt')} />
            </Field>
            <Field label="Closes" hint="Applications close at end of this day (11:59 pm).">
              <Input type="date" value={form.endAt ?? ''} onChange={set('endAt')} min={form.startAt || undefined} />
            </Field>
          </div>
          <Field label="Status">
            <Select value={form.status ?? 'draft'} onChange={set('status')}>
              {['draft', 'open', 'closed', 'merit', 'completed'].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          {editItem && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Merit weight — Matric %"><Input type="number" step="0.01" value={form.meritWMatric ?? ''} onChange={set('meritWMatric')} /></Field>
              <Field label="Merit weight — Inter %"><Input type="number" step="0.01" value={form.meritWInter ?? ''} onChange={set('meritWInter')} /></Field>
              <Field label="Hafiz bonus marks"><Input type="number" value={form.hafizBonus ?? ''} onChange={set('hafizBonus')} /></Field>
              <Field label="Challan due days"><Input type="number" value={form.challanDueDays ?? ''} onChange={set('challanDueDays')} /></Field>
            </div>
          )}
          {cycleErrors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <b>Required:</b>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {cycleErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button disabled={cycleErrors.length > 0} onClick={() => submit('/academic/cycles', `/academic/cycles/${editItem?.id}`, cycleSubmitBody(), 'Cycle')}>
              {editItem ? 'Save Changes' : 'Add Cycle'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────── Designation modal ────── */}
      <Modal open={modal === 'designation'} title={editItem ? 'Edit Designation' : 'Add Designation'} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Title (e.g. Professor, Lecturer)"><Input value={form.title ?? ''} onChange={set('title')} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => submit('/academic/designations', `/academic/designations/${editItem?.id}`, form, 'Designation')}>
              {editItem ? 'Save Changes' : 'Add Designation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────── Inter-group modal ────── */}
      <Modal open={modal === 'interGroup'} title={editItem ? 'Edit Intermediate Group' : 'Add Intermediate Group'} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Name (e.g. Pre-Medical)"><Input value={form.name ?? ''} onChange={set('name')} /></Field>
          <Field label="Code (e.g. PRE-MED)"><Input value={form.code ?? ''} onChange={set('code')} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => submit('/academic/inter-groups', `/academic/inter-groups/${editItem?.id}`, form, 'Intermediate group')}>
              {editItem ? 'Save Changes' : 'Add Group'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ────── Document type modal ────── */}
      <Modal open={modal === 'documentType'} title={editItem ? 'Edit Document Type' : 'Add Document Type'} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Name (e.g. Matric Certificate)"><Input value={form.name ?? ''} onChange={set('name')} /></Field>
          <Field label="Applies to">
            <Select value={form.appliesTo ?? 'both'} onChange={set('appliesTo')}>
              <option value="both">Both (Intermediate & BS)</option>
              <option value="intermediate">Intermediate only</option>
              <option value="bs">BS only</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isRequired ?? true} onChange={set('isRequired')} /> Required for verification</label>
          {editItem && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive ?? true} onChange={set('isActive')} /> Active</label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => submit('/academic/document-types', `/academic/document-types/${editItem?.id}`, form, 'Document type')}>
              {editItem ? 'Save Changes' : 'Add Document Type'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
