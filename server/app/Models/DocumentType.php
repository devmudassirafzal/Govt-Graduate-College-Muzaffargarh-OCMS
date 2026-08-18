<?php

/**
 * Created by Reliese Model.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

/**
 * Class DocumentType
 * 
 * @property int $id
 * @property string $name
 * @property string $applies_to
 * @property bool $is_required
 * @property bool $is_active
 * 
 * @property Collection|ApplicationDocument[] $application_documents
 *
 * @package App\Models
 */
class DocumentType extends Model
{
	use \App\Models\Traits\CamelCaseRelations;

	protected $table = 'document_types';
	public $timestamps = false;

	protected $casts = [
		'is_required' => 'bool',
		'is_active' => 'bool'
	];

	protected $fillable = [
		'name',
		'applies_to',
		'is_required',
		'is_active'
	];

	public function application_documents()
	{
		return $this->hasMany(ApplicationDocument::class);
	}
}
