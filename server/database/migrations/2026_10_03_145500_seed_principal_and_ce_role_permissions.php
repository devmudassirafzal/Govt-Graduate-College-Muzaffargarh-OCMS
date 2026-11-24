<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RoleHasPermission;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $allPermissions = [
            // Admissions
            ['name' => 'admissions.view', 'label' => 'View Applications', 'group' => 'admissions'],
            ['name' => 'admissions.verify', 'label' => 'Verify Documents', 'group' => 'admissions'],
            ['name' => 'admissions.approve', 'label' => 'Approve Applications', 'group' => 'admissions'],
            // Merit
            ['name' => 'merit.view', 'label' => 'View Merit Lists', 'group' => 'merit'],
            ['name' => 'merit.generate', 'label' => 'Generate Merit Lists', 'group' => 'merit'],
            ['name' => 'merit.publish', 'label' => 'Publish Merit Lists', 'group' => 'merit'],
            // Challans
            ['name' => 'challans.view', 'label' => 'View Fee Challans', 'group' => 'challans'],
            ['name' => 'challans.verify', 'label' => 'Verify Challan Payments', 'group' => 'challans'],
            ['name' => 'challans.manage', 'label' => 'Manage Fee Structure', 'group' => 'challans'],
            // Students
            ['name' => 'students.view', 'label' => 'View Students', 'group' => 'students'],
            ['name' => 'students.update', 'label' => 'Update Student Details', 'group' => 'students'],
            ['name' => 'students.promote', 'label' => 'Promote Batch / Shifts', 'group' => 'students'],
            // Teachers
            ['name' => 'teachers.view', 'label' => 'View Faculty', 'group' => 'teachers'],
            ['name' => 'teachers.create', 'label' => 'Add Faculty Member', 'group' => 'teachers'],
            ['name' => 'teachers.update', 'label' => 'Update Faculty Details', 'group' => 'teachers'],
            ['name' => 'teachers.delete', 'label' => 'Delete Faculty Member', 'group' => 'teachers'],
            // Staff & Departments & Academic
            ['name' => 'departments.manage', 'label' => 'Manage Departments & HODs', 'group' => 'departments'],
            ['name' => 'staff.manage', 'label' => 'Manage Staff Accounts', 'group' => 'staff'],
            ['name' => 'academic.view', 'label' => 'View Academic Setup', 'group' => 'academic'],
            ['name' => 'academic.manage', 'label' => 'Manage Programs & Sessions', 'group' => 'academic'],
            // Timetable
            ['name' => 'timetable.view', 'label' => 'View Timetables', 'group' => 'timetable'],
            ['name' => 'timetable.manage', 'label' => 'Manage Timetables & Rooms', 'group' => 'timetable'],
            // Attendance
            ['name' => 'attendance.reports', 'label' => 'View Attendance Reports', 'group' => 'attendance'],
            // Library
            ['name' => 'library.view', 'label' => 'View Library Catalog', 'group' => 'library'],
            ['name' => 'library.manage', 'label' => 'Issue Books & Manage Catalog', 'group' => 'library'],
            // Notices & Website & Settings
            ['name' => 'notices.view', 'label' => 'View Notices', 'group' => 'notices'],
            ['name' => 'notices.create', 'label' => 'Create Notices', 'group' => 'notices'],
            ['name' => 'notices.update', 'label' => 'Edit Notices', 'group' => 'notices'],
            ['name' => 'notices.delete', 'label' => 'Delete Notices', 'group' => 'notices'],
            ['name' => 'website.view', 'label' => 'View Website Content', 'group' => 'website'],
            ['name' => 'website.manage', 'label' => 'Update Website Content', 'group' => 'website'],
            ['name' => 'settings.view', 'label' => 'View Settings', 'group' => 'settings'],
            ['name' => 'settings.update', 'label' => 'Update Settings', 'group' => 'settings'],
            // Committees
            ['name' => 'committee.view', 'label' => 'View Committees', 'group' => 'committee'],
            ['name' => 'committee.manage', 'label' => 'Manage Committees & Members', 'group' => 'committee'],
            // Assets, Tasks, Marks, Examinations
            ['name' => 'assets.manage', 'label' => 'Manage Assets', 'group' => 'assets'],
            ['name' => 'tasks.manage', 'label' => 'Manage Tasks', 'group' => 'tasks'],
            ['name' => 'marks.manage', 'label' => 'Manage / Override Marks', 'group' => 'marks'],
            ['name' => 'examinations.manage', 'label' => 'Manage Examinations', 'group' => 'examinations'],
        ];

        foreach ($allPermissions as $pData) {
            Permission::firstOrCreate(['name' => $pData['name']], $pData);
        }

        $principalRole = Role::firstOrCreate(['name' => 'principal']);
        $permIds = Permission::pluck('id');
        foreach ($permIds as $pid) {
            RoleHasPermission::firstOrCreate([
                'role_id' => $principalRole->id,
                'permission_id' => $pid
            ]);
        }

        $ceRole = Role::firstOrCreate(['name' => 'controller_examiner']);
        $examPerm = Permission::where('name', 'examinations.manage')->first();
        if ($ceRole && $examPerm) {
            RoleHasPermission::firstOrCreate([
                'role_id' => $ceRole->id,
                'permission_id' => $examPerm->id
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No reversal needed for permission grants
    }
};
