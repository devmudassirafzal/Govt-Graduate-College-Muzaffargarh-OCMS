import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/site/PageHeader';
import Loading from '../components/site/Loading';

// Photo circle with initials fallback — teachers set their photo from the portal.
export function FacultyAvatar({ teacher, size = 'h-14 w-14', text = 'text-lg' }) {
  if (teacher.photoPath) {
    return (
      <img
        src={teacher.photoPath}
        alt={teacher.name}
        className={`${size} shrink-0 rounded-full border-2 border-green-100 object-cover object-top`}
      />
    );
  }
  return (
    <div className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-primary ${text} font-bold text-white`}>
      {teacher.name.split(' ').filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('')}
    </div>
  );
}

export default function Faculty() {
  const [searchParams, setSearchParams] = useSearchParams();
  const department = searchParams.get('department') || '';
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api
      .get('/public/faculty', { params: department ? { department } : {} })
      .then((res) => setData(res.data))
      .catch(() => setData({ departments: [], faculty: [] }));
  }, [department]);

  return (
    <div>
      <PageHeader title="Our Faculty" subtitle="Professors, lecturers, and specialists of GGCM" />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Department:</label>
          <select
            value={department}
            onChange={(e) => setSearchParams(e.target.value ? { department: e.target.value } : {})}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">All departments</option>
            {data?.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {!data && <Loading />}
        {data && data.faculty.length === 0 && (
          <p className="py-16 text-center text-slate-500">No faculty members found.</p>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data?.faculty.map((t) => (
            <Link
              key={t.id}
              to={`/faculty/${t.id}`}
              className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-lg"
            >
              <div className="mb-3 flex items-center gap-4">
                <FacultyAvatar teacher={t} />
                <div>
                  <h2 className="font-bold text-slate-800 group-hover:text-primary">{t.name}</h2>
                  <p className="text-sm text-accent">{t.designation}</p>
                </div>
              </div>
              <dl className="space-y-1 text-sm text-slate-600">
                <div><span className="font-medium">Department:</span> {t.department}</div>
                {t.qualification && <div><span className="font-medium">Qualification:</span> {t.qualification}</div>}
                {t.specialization && <div><span className="font-medium">Specialization:</span> {t.specialization}</div>}
              </dl>
              <div className="mt-3 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                View full profile →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
