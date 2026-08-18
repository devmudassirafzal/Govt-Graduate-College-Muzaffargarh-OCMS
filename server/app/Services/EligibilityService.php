<?php

namespace App\Services;

use App\Models\Program;
use App\Models\InterGroup;

class EligibilityService
{
    public static function checkEligibility($data)
    {
        $program = Program::with(['programEligibilities.interGroup'])->find($data['programId']);
        
        if (!$program || !$program->is_active) {
            return ['eligible' => false, 'reason' => 'This program is not open for admission.'];
        }

        $minPct = (float) $program->min_percentage;

        if ($program->level === 'intermediate') {
            $pct = ($data['matricObtained'] / $data['matricTotal']) * 100;
            if ($pct < $minPct) {
                return [
                    'eligible' => false,
                    'reason' => "Your Matric percentage (" . number_format($pct, 1) . "%) is below the required minimum of {$minPct}% for {$program->name}."
                ];
            }
            return ['eligible' => true];
        }

        // BS
        if (empty($data['interGroupId']) || empty($data['interObtained']) || empty($data['interTotal'])) {
            return ['eligible' => false, 'reason' => 'Intermediate details (group, marks) are required for BS programs.'];
        }

        $allowedGroupIds = $program->programEligibilities->pluck('inter_group_id')->toArray();
        if (!in_array($data['interGroupId'], $allowedGroupIds)) {
            $group = InterGroup::find($data['interGroupId']);
            $allowedNames = $program->programEligibilities->pluck('interGroup.name')->implode(', ');
            $groupName = $group ? $group->name : 'selected';
            return [
                'eligible' => false,
                'reason' => "{$program->name} does not accept applicants from the {$groupName} group. Eligible groups: {$allowedNames}. A clerk may apply a manual override for genuine special cases."
            ];
        }

        $pct = ($data['interObtained'] / $data['interTotal']) * 100;
        if ($pct < $minPct) {
            return [
                'eligible' => false,
                'reason' => "Your Intermediate percentage (" . number_format($pct, 1) . "%) is below the required minimum of {$minPct}% for {$program->name}."
            ];
        }

        return ['eligible' => true];
    }
}
