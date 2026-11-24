<?php
$user = App\Models\User::where('email', 'ce@ggcm.com')->first();
if ($user) {
    auth()->login($user);
    $request = Illuminate\Http\Request::create('/api/examiner/exams', 'GET');
    $response = app()->handle($request);
    echo $response->getContent();
}
