<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Exam;
use App\Models\QuestionPaper;
use App\Models\ExamAllocation;
use App\Models\RollNumberSlip;
use App\Models\Student;
use App\Models\Challan;
use App\Services\NotifyService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Gate;

class ControllerExaminerController extends Controller
{
    // === EXAMS ===
    public function getExams()
    {
        Gate::authorize('examinations.manage'); // we will create this permission
        $exams = Exam::orderBy('created_at', 'desc')->get();
        return response()->json(['exams' => $exams]);
    }

    public function createExam(Request $request)
    {
        Gate::authorize('examinations.manage');
        $req = $request->validate([
            'name' => 'required|string',
            'term' => 'required|in:mid,final,term',
            'startDate' => 'nullable|date',
            'endDate' => 'nullable|date'
        ]);

        $exam = Exam::create([
            'name' => $req['name'],
            'term' => $req['term'],
            'start_date' => $req['startDate'],
            'end_date' => $req['endDate'],
            'is_active' => true
        ]);

        return response()->json(['exam' => $exam], 201);
    }

    public function updateExam(Request $request, $id)
    {
        Gate::authorize('examinations.manage');
        $exam = Exam::findOrFail($id);
        $req = $request->validate([
            'name' => 'required|string',
            'term' => 'required|in:mid,final,term',
            'startDate' => 'nullable|date',
            'endDate' => 'nullable|date'
        ]);

        $exam->update([
            'name' => $req['name'],
            'term' => $req['term'],
            'start_date' => $req['startDate'],
            'end_date' => $req['endDate']
        ]);

        return response()->json(['exam' => $exam]);
    }

    public function deleteExam($id)
    {
        Gate::authorize('examinations.manage');
        $exam = Exam::findOrFail($id);
        
        // Prevent deletion if there are already allocations or submitted papers
        if ($exam->allocations()->count() > 0 || $exam->papers()->count() > 0) {
            return response()->json(['message' => 'Cannot delete an exam that already has allocations or submitted question papers.'], 422);
        }

        $exam->delete();
        return response()->json(['message' => 'Exam deleted successfully.']);
    }

    public function toggleExamStatus($id)
    {
        Gate::authorize('examinations.manage');
        $exam = Exam::findOrFail($id);
        $exam->update(['is_active' => !$exam->is_active]);
        return response()->json(['exam' => $exam]);
    }

    // === QUESTION PAPERS (INBOX) ===
    public function getSubmittedPapers()
    {
        Gate::authorize('examinations.manage');
        $papers = QuestionPaper::with(['exam', 'subject', 'teacher.user', 'questions'])
            ->whereIn('status', ['submitted', 'printed'])
            ->orderBy('updated_at', 'desc')
            ->get();
        return response()->json(['papers' => $papers]);
    }

    public function markPaperPrinted($id)
    {
        Gate::authorize('examinations.manage');
        $paper = QuestionPaper::findOrFail($id);
        $paper->update(['status' => 'printed']);
        return response()->json(['message' => 'Paper marked as printed.']);
    }

    // === ALLOCATIONS ===
    public function getAllocations($examId)
    {
        Gate::authorize('examinations.manage');
        $allocations = ExamAllocation::with(['classSection.program', 'room'])
            ->where('exam_id', $examId)
            ->get();
        return response()->json(['allocations' => $allocations]);
    }

    public function createAllocation(Request $request, $examId)
    {
        Gate::authorize('examinations.manage');
        $req = $request->validate([
            'classSectionId' => 'required|integer',
            'roomId' => 'required|integer',
            'startSerial' => 'required|integer',
            'endSerial' => 'required|integer'
        ]);

        $allocation = ExamAllocation::create([
            'exam_id' => $examId,
            'class_section_id' => $req['classSectionId'],
            'room_id' => $req['roomId'],
            'start_serial' => $req['startSerial'],
            'end_serial' => $req['endSerial']
        ]);

        return response()->json(['allocation' => $allocation->load('classSection.program', 'room')], 201);
    }

    // === ROLL NUMBER SLIPS & FEES ===
    public function getStudentsForSlips(Request $request, $examId)
    {
        Gate::authorize('examinations.manage');
        
        $query = Student::with(['program', 'classSection', 'user'])
            ->withCount(['challans as unpaid_challans_count' => function ($q) {
                $q->whereIn('status', ['unpaid', 'fee_submitted']);
            }])
            ->where('status', 'active');

        if ($request->filled('programId')) {
            $query->where('program_id', $request->query('programId'));
        }
        if ($request->filled('classSectionId')) {
            $query->where('class_section_id', $request->query('classSectionId'));
        }
        if ($request->filled('q')) {
            $needle = trim($request->query('q'));
            $query->where(function ($w) use ($needle) {
                $w->where('name', 'like', "%{$needle}%")
                  ->orWhere('roll_number', 'like', "%{$needle}%");
            });
        }

        // Limit results to 200 per view or allow all if filtered
        $students = $query->orderBy('roll_number', 'asc')->take(200)->get();

        $students = $students->map(function ($s) {
            $s->has_unpaid_fees = $s->unpaid_challans_count > 0;
            $s->hasUnpaidFees = $s->unpaid_challans_count > 0;
            return $s;
        });

        $slips = RollNumberSlip::where('exam_id', $examId)->get()->keyBy('student_id');

        return response()->json([
            'students' => $students,
            'generatedSlips' => $slips
        ]);
    }

    public function generateSlip(Request $request, $examId)
    {
        Gate::authorize('examinations.manage');
        $req = $request->validate(['studentId' => 'required|integer']);

        $student = Student::findOrFail($req['studentId']);
        $unpaidCount = Challan::where('student_id', $student->id)->whereIn('status', ['unpaid', 'fee_submitted'])->count();
        if ($unpaidCount > 0) {
            return response()->json(['message' => 'Cannot generate slip. Student has unpaid fees/fines.'], 422);
        }

        $slip = RollNumberSlip::firstOrCreate([
            'exam_id' => $examId,
            'student_id' => $student->id
        ], [
            'generated_at' => Carbon::now()
        ]);

        return response()->json(['slip' => $slip]);
    }

    public function notifyUnpaid(Request $request)
    {
        Gate::authorize('examinations.manage');
        $req = $request->validate(['studentId' => 'required|integer']);
        $student = Student::findOrFail($req['studentId']);

        // Send portal notification
        NotifyService::notify($student->user_id, 'unpaid_fee_exam', 'Roll Number Slip Blocked', 'Your Roll Number Slip for the upcoming exam cannot be generated because you have unpaid fees or fines. Please clear your dues immediately.', '/portal/challans');

        return response()->json(['message' => 'Notification sent to student.']);
    }
}
