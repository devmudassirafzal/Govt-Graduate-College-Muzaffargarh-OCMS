<?php
$teacher = App\Models\User::whereHas('roles', function($q){ $q->where('name', 'teacher'); })->first();
if ($teacher) {
    echo $teacher->roles->pluck('name');
}
