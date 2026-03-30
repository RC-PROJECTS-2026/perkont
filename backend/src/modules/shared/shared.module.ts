import { Module, Global } from '@nestjs/common';
import { DocumentRenderService } from './document-render.service';
import { DocxRenderService } from './docx-render.service';

@Global()
@Module({
  providers: [DocumentRenderService, DocxRenderService],
  exports: [DocumentRenderService, DocxRenderService],
})
export class SharedModule {}
