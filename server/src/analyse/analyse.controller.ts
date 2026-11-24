import { Controller, ForbiddenException, Get, NotFoundException, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyseService, Subject, SUBJECTS, SUBJECT_PERMISSION } from './analyse.service';

@Controller('analyse')
@UseGuards(JwtAuthGuard)
export class AnalyseController {
  constructor(private readonly analyse: AnalyseService) {}

  /** The rows behind a dashboard figure. Needs the right to view that area. */
  @Get(':subject')
  async dataset(@Param('subject') subject: string, @Request() req: any) {
    if (!(SUBJECTS as readonly string[]).includes(subject)) throw new NotFoundException('There is nothing to analyse there');
    const permissions: string[] = req.user.permissions ?? [];
    if (!permissions.includes(SUBJECT_PERMISSION[subject as Subject])) {
      throw new ForbiddenException('Your role profile does not include that area');
    }
    return this.analyse.dataset(subject as Subject, permissions);
  }
}
