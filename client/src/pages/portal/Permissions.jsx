import { useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import { Card, Button, Input, Select, Modal, Field, useFlash, useConfirm, errText } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const GROUP_LABEL = {
  admissions: 'Admissions desk',
  merit: 'Merit lists',
  challans: 'Fee challans',
  students: 'Students',
  teachers: 'Teachers',
  departments: 'Departments',
  academic: 'Academic structure',
  timetable: 'Timetable',
  library: 'Library',
  committee: 'Committees',
  notices: 'Notices',
  website: 'Website content',
  settings: 'System settings',
  staff: 'Staff accounts',
};

// What identity roles do by design (not grantable module permissions).
const ROLE_NOTES = {
  admin: 'Full system control — passes every permission check, manages this page.',
  principal: 'Super admin — passes every permission check, manages this page.',
  hod: 'Granted automatically with a HOD nomination: own department page, gallery, students.',
  teacher: 'Own classes: attendance, assessments & marks, classwork, timetable, profile.',
  student: 'Own records: attendance, marks, classwork, challans, library, student card.',
  applicant: 'Register, apply online, track applications, upload documents.',
};

// Admin permission center: pick a role, tick the permissions it should hold
// (toggled live, Spatie-style), plus per-user access control below.
export default function Permissions() {
  const { user: me } = useAuth();
  const [matrix, setMatrix] = useState(null); // { permissions, roles }
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');
  const [roleName, setRoleName] = useState(''); // role selected in the combobox
  const [permQ, setPermQ] = useState(''); // filter over the permission checklist
  const [grant, setGrant] = useState(null); // user being granted a role
  const [grantRole, setGrantRole] = useState('');
  const [reset, setReset] = useState(null); // user being password-reset
  const [newPassword, setNewPassword] = useState('');
  const [direct, setDirect] = useState(null); // user whose direct permissions are being edited
  const [directPerms, setDirectPerms] = useState(null); // that user's direct permission ids
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(null); // "roleName:permId" while a toggle is in flight
  const [flash, flashEl] = useFlash();
  const [confirm, confirmEl] = useConfirm();

  const loadMatrix = () => api.get('/admin/permissions').then((r) => setMatrix(r.data));
  const loadUsers = () => api.get('/users', { params: q ? { q } : {} }).then((r) => setUsers(r.data.users));

  useEffect(() => { loadMatrix(); }, []);
  useEffect(() => { loadUsers(); }, [q]);

  const groups = useMemo(() => {
    const needle = permQ.trim().toLowerCase();
    const map = new Map();
    for (const p of matrix?.permissions ?? []) {
      if (needle && !`${p.label} ${p.name} ${GROUP_LABEL[p.group] ?? p.group}`.toLowerCase().includes(needle)) continue;
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group).push(p);
    }
    return [...map.entries()];
  }, [matrix, permQ]);

  // Unfiltered grouping for the per-user direct-permission editor.
  const allGroups = useMemo(() => {
    const map = new Map();
    for (const p of matrix?.permissions ?? []) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group).push(p);
    }
    return [...map.entries()];
  }, [matrix]);

  const editableRoles = (matrix?.roles ?? []).filter((r) => r.grantable && !r.superAdmin);
  const role = editableRoles.find((r) => r.name === roleName) ?? editableRoles[0] ?? null;

  async function togglePermission(role, perm, has) {
    const key = `${role.name}:${perm.id}`;
    try {
      setSaving(key);
      const r = has
        ? await api.delete(`/admin/roles/${role.name}/permissions/${perm.name}`)
        : await api.post(`/admin/roles/${role.name}/permissions`, { permission: perm.name });
      flash({ type: 'ok', text: r.data.message });
      // update in place — no full reload, so the checklist doesn't jump
      setMatrix((m) => ({
        ...m,
        roles: m.roles.map((x) => x.id === role.id
          ? { ...x, permissions: has ? x.permissions.filter((id) => id !== perm.id) : [...x.permissions, perm.id] }
          : x),
      }));
    } catch (e) { flash({ type: 'error', text: errText(e) }); }
    finally { setSaving(null); }
  }

  // Grant or revoke a whole group ("allow all of Teachers") with one click.
  async function toggleGroup(role, perms, grantAll) {
    const targets = perms.filter((p) => role.permissions.includes(p.id) === !grantAll);
    for (const perm of targets) {
      // sequential on purpose: each call flashes its own success/failure message
      await togglePermission(role, perm, !grantAll);
    }
  }

  // Make this role's grants exactly match a target set of permission ids.
  async function applyPermissionSet(role, targetIds, label) {
    const target = new Set(targetIds);
    const toRevoke = (matrix?.permissions ?? []).filter((p) => role.permissions.includes(p.id) && !target.has(p.id));
    const toGrant = (matrix?.permissions ?? []).filter((p) => !role.permissions.includes(p.id) && target.has(p.id));
    try {
      setBusy(true);
      for (const p of toRevoke) await api.delete(`/admin/roles/${role.name}/permissions/${p.name}`);
      for (const p of toGrant) await api.post(`/admin/roles/${role.name}/permissions`, { permission: p.name });
      await loadMatrix();
      flash({ type: 'ok', text: `${label} — ${toGrant.length} granted, ${toRevoke.length} revoked.` });
    } catch (e) { flash({ type: 'error', text: errText(e) }); loadMatrix(); }
    finally { setBusy(false); }
  }

  function copyFromRole(sourceName) {
    const source = matrix?.roles?.find((r) => r.name === sourceName);
    if (!source || !role) return;
    confirm(`Copy "${sourceName}" permissions onto "${role.name}"? Its current grants will be replaced.`, () =>
      applyPermissionSet(role, source.permissions, `Copied ${sourceName}'s permissions to ${role.name}`));
  }

  function resetToDefaults() {
    if (!role) return;
    const defaultNames = matrix?.defaults?.[role.name] ?? [];
    const ids = (matrix?.permissions ?? []).filter((p) => defaultNames.includes(p.name)).map((p) => p.id);
    confirm(`Reset "${role.name}" to the permissions it shipped with (${ids.length})?`, () =>
      applyPermissionSet(role, ids, `Reset ${role.name} to defaults`));
  }

  // Per-user direct permissions (on top of whatever the user's roles grant).
  function openDirect(u) {
    setDirect(u);
    setDirectPerms(null);
    api.get(`/admin/users/${u.id}/permissions`).then((r) => setDirectPerms(r.data.permissions));
  }

  async function toggleDirect(perm, has) {
    try {
      const r = has
        ? await api.delete(`/admin/users/${direct.id}/permissions/${perm.name}`)
        : await api.post(`/admin/users/${direct.id}/permissions`, { permission: perm.name });
      flash({ type: 'ok', text: r.data.message });
      setDirectPerms((ids) => (has ? ids.filter((id) => id !== perm.id) : [...ids, perm.id]));
    } catch (e) { flash({ type: 'error', text: errText(e) }); }
  }

  async function grantSubmit() {
    try {
      setBusy(true);
      const r = await api.post(`/admin/users/${grant.id}/roles`, { role: grantRole });
      flash({ type: 'ok', text: r.data.message });
      setGrant(null); setGrantRole('');
      loadUsers(); loadMatrix();
    } catch (e) { flash({ type: 'error', text: errText(e) }); }
    finally { setBusy(false); }
  }

  function revoke(u, role) {
    confirm(`Remove the "${role}" role from ${u.name}? They immediately lose that portal and its permissions.`, async () => {
      try {
        const r = await api.delete(`/admin/users/${u.id}/roles/${role}`);
        flash({ type: 'ok', text: r.data.message });
        loadUsers(); loadMatrix();
      } catch (e) { flash({ type: 'error', text: errText(e) }); }
    });
  }

  async function resetSubmit() {
    try {
      setBusy(true);
      const r = await api.put(`/users/${reset.id}/reset-password`, newPassword ? { newPassword } : {});
      flash({
        type: 'ok',
        text: r.data.tempPassword
          ? `${r.data.message} Temporary password: "${r.data.tempPassword}" — share it now, it is only shown once.`
          : `${r.data.message} They must set a new password at next login.`,
      });
      setReset(null); setNewPassword('');
    } catch (e) { flash({ type: 'error', text: errText(e) }); }
    finally { setBusy(false); }
  }

  function toggleActive(u) {
    const target = !u.isActive;
    confirm(`${target ? 'Activate' : 'Disable'} ${u.name}'s account?${target ? '' : ' They will not be able to sign in.'}`, async () => {
      try {
        const r = await api.put(`/admin/users/${u.id}/active`, { isActive: target });
        flash({ type: 'ok', text: r.data.message });
        loadUsers();
      } catch (e) { flash({ type: 'error', text: errText(e) }); }
    });
  }

  return (
    <div className="space-y-6">
      {flashEl}{confirmEl}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Permissions</h1>
        <p className="text-sm text-slate-500">
          Tick a box to allow a role to do something; untick to take it away. Changes apply on the role&apos;s next request —
          no re-login needed. <span className="font-medium text-slate-600">Admin and Principal always have full access.</span>
        </p>
      </div>

      {/* Pick a role, tick what it may do */}
      <Card title="What each role is allowed to do">
        {matrix === null ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Role">
                <Select value={role?.name ?? ''} onChange={(e) => setRoleName(e.target.value)} style={{ width: 240, textTransform: 'capitalize' }}>
                  {editableRoles.map((r) => (
                    <option key={r.id} value={r.name} className="capitalize">
                      {r.name} — {r.users} account{r.users === 1 ? '' : 's'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Find a permission">
                <Input placeholder="e.g. delete, merit, teachers…" value={permQ} onChange={(e) => setPermQ(e.target.value)} style={{ width: 220 }} />
              </Field>
              {role && (
                <div className="flex gap-2 pb-0.5">
                  <Select value="" disabled={busy} onChange={(e) => { if (e.target.value) copyFromRole(e.target.value); e.target.value = ''; }} style={{ width: 160 }}>
                    <option value="">Copy from…</option>
                    {editableRoles.filter((r) => r.name !== role.name).map((r) => (
                      <option key={r.id} value={r.name} style={{ textTransform: 'capitalize' }}>{r.name}</option>
                    ))}
                  </Select>
                  <Button variant="outline" disabled={busy} onClick={resetToDefaults}>Reset to defaults</Button>
                </div>
              )}
              {role && (
                <div className="pb-2 text-sm text-slate-500">
                  <span className="font-semibold capitalize text-slate-700">{role.name}</span> holds{' '}
                  <span className="font-semibold text-primary">{role.permissions.length}</span> of {matrix.permissions.length} permissions.
                  {ROLE_NOTES[role.name] && <span className="block text-xs text-slate-400">{ROLE_NOTES[role.name]}</span>}
                </div>
              )}
            </div>

            {role && (
              <div className="grid gap-4 md:grid-cols-2">
                {groups.map(([group, perms]) => (
                  <PermissionGroup key={group} group={group} perms={perms} role={role}
                    saving={saving} onToggle={togglePermission} onToggleGroup={toggleGroup} />
                ))}
                {groups.length === 0 && (
                  <p className="col-span-full py-6 text-center text-sm text-slate-400">No permission matches "{permQ}".</p>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Built-in role behavior that isn't permission-driven */}
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(ROLE_NOTES).map(([role, note]) => (
          <div key={role} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="text-sm font-semibold capitalize text-slate-800">
              {role}
              {['admin', 'principal'].includes(role) && (
                <span className="ml-2 rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary ring-1 ring-green-200">full access</span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{note}</div>
          </div>
        ))}
      </div>

      {/* Per-user access control */}
      <Card
        title="User access"
        actions={<Input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />}
      >
        <div className="space-y-2">
          {(users ?? []).map((u) => (
            <div key={u.id} className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${u.isActive ? 'border-slate-200' : 'border-red-200 bg-red-50/50'}`}>
              <div className="min-w-48 flex-1">
                <div className="text-sm font-medium text-slate-800">
                  {u.name} {String(u.id) === String(me.id) && <span className="text-xs text-slate-400">(you)</span>}
                  {!u.isActive && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">disabled</span>}
                </div>
                <div className="text-xs text-slate-400">{u.email}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {u.roles.map((role) => (
                  <span key={role} className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium capitalize text-primary ring-1 ring-green-200">
                    {role}
                    {String(u.id) !== String(me.id) && (
                      <button className="text-slate-400 hover:text-red-600" title={`Remove ${role} role`}
                        onClick={() => revoke(u, role)}>✕</button>
                    )}
                  </span>
                ))}
              </div>
              {String(u.id) !== String(me.id) && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setGrant(u); setGrantRole(''); }}>+ Role</Button>
                  <Button variant="outline" onClick={() => openDirect(u)}>Permissions</Button>
                  <Button variant="outline" onClick={() => { setReset(u); setNewPassword(''); }}>Reset password</Button>
                  <Button variant={u.isActive ? 'danger' : 'primary'} onClick={() => toggleActive(u)}>
                    {u.isActive ? 'Disable' : 'Activate'}
                  </Button>
                </div>
              )}
            </div>
          ))}
          {users !== null && users.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No users match.</p>}
          {users === null && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}
        </div>
      </Card>

      {/* Grant role modal */}
      <Modal open={!!grant} title={grant ? `Grant a role — ${grant.name}` : ''} onClose={() => setGrant(null)}>
        {grant && (
          <div className="space-y-3">
            <Field label="Role to grant">
              <Select value={grantRole} onChange={(e) => setGrantRole(e.target.value)}>
                <option value="">Select…</option>
                {(matrix?.roles ?? []).filter((r) => !grant.roles.includes(r.name)).map((r) => (
                  <option key={r.name} value={r.name} className="capitalize">{r.name}</option>
                ))}
              </Select>
            </Field>
            {grantRole && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-slate-600">
                <div className="mb-1 font-semibold capitalize text-primary">{grantRole} can:</div>
                <GrantPreview matrix={matrix} roleName={grantRole} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGrant(null)}>Cancel</Button>
              <Button disabled={!grantRole || busy} onClick={grantSubmit}>{busy ? 'Granting…' : 'Grant role'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Per-user direct permissions modal */}
      <Modal open={!!direct} wide title={direct ? `Direct permissions — ${direct.name}` : ''} onClose={() => { setDirect(null); setDirectPerms(null); }}>
        {direct && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              These are extras granted to <b>{direct.name}</b> personally, on top of whatever their roles
              ({direct.roles.join(', ')}) allow. Untick to remove the extra — role permissions are unaffected.
            </p>
            {directPerms === null ? (
              <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
            ) : (
              <div className="grid max-h-96 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
                {allGroups.map(([group, perms]) => (
                  <div key={group} className="rounded-lg border border-slate-200">
                    <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {GROUP_LABEL[group] ?? group}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {perms.map((p) => {
                        const has = directPerms.includes(p.id);
                        return (
                          <label key={p.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-slate-50">
                            <input type="checkbox" className="h-4 w-4 shrink-0 cursor-pointer accent-green-700"
                              checked={has} onChange={() => toggleDirect(p, has)} aria-label={`${direct.name}: ${p.label}`} />
                            <span className="text-xs text-slate-700">{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => { setDirect(null); setDirectPerms(null); }}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset password modal */}
      <Modal open={!!reset} title={reset ? `Reset password — ${reset.name}` : ''} onClose={() => setReset(null)}>
        {reset && (
          <div className="space-y-3">
            <Field label="New password" hint="Leave blank to generate a random temporary password (shown once). Either way, they must choose their own at next login.">
              <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank for a random one" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReset(null)}>Cancel</Button>
              <Button disabled={busy || (newPassword !== '' && newPassword.length < 8)} onClick={resetSubmit}>
                {busy ? 'Resetting…' : 'Reset password'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// One module box: header with an "allow everything here" master checkbox, then a
// checkbox per fine-grained permission (view / create / edit / delete …).
function PermissionGroup({ group, perms, role, saving, onToggle, onToggleGroup }) {
  const held = perms.filter((p) => role.permissions.includes(p.id)).length;
  const all = held === perms.length;
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {GROUP_LABEL[group] ?? group}
          <span className="ml-2 font-normal normal-case text-slate-400">{held}/{perms.length}</span>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-green-700"
            checked={all}
            onChange={() => onToggleGroup(role, perms, !all)}
            aria-label={`${role.name}: all ${group} permissions`}
          />
          all
        </label>
      </div>
      <div className="divide-y divide-slate-100">
        {perms.map((p) => {
          const has = role.permissions.includes(p.id);
          const key = `${role.name}:${p.id}`;
          return (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 cursor-pointer accent-green-700 disabled:cursor-wait"
                checked={has}
                disabled={saving === key}
                onChange={() => onToggle(role, p, has)}
                aria-label={`${role.name}: ${p.label}`}
              />
              <span className="min-w-0">
                <span className="block text-sm text-slate-700">{p.label}</span>
                <span className="block font-mono text-[10px] text-slate-300">{p.name}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function GrantPreview({ matrix, roleName }) {
  const role = matrix?.roles?.find((r) => r.name === roleName);
  if (!role) return null;
  if (roleName === 'principal') return <p>Full access to every module, the audit trail, and this Permissions page.</p>;
  if (roleName === 'admin') return <p>Reads every module and manages access control — roles, permissions, HOD nominations, and user accounts. Does not create operational content (timetables, notices, academic records, library, etc.); that belongs to the relevant staff role.</p>;
  if (role.superAdmin) return <p>Full access to every module, the audit trail, and this Permissions page.</p>;
  if (ROLE_NOTES[roleName] && !role.grantable) return <p>{ROLE_NOTES[roleName]}</p>;
  const labels = (matrix.permissions ?? []).filter((p) => role.permissions.includes(p.id)).map((p) => p.label);
  if (labels.length === 0) return <p>{ROLE_NOTES[roleName] ?? 'No module permissions granted yet — use the matrix above to allow things.'}</p>;
  return (
    <ul className="list-inside list-disc space-y-0.5">
      {labels.map((l) => <li key={l}>{l}</li>)}
      {ROLE_NOTES[roleName] && <li>{ROLE_NOTES[roleName]}</li>}
    </ul>
  );
}
