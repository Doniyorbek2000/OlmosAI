import { Global, Module } from '@nestjs/common';
import { ConceptImageService } from './concept-image.service';
import { TextTo3DWorkflow } from './text-to-3d.workflow';

@Global()
@Module({
  providers: [ConceptImageService, TextTo3DWorkflow],
  exports: [ConceptImageService, TextTo3DWorkflow],
})
export class WorkflowsModule {}
