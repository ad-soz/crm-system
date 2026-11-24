import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // Open to everyone signed in; each section is filtered by permission.
  @Get()
  getSummary(@Request() req: any) {
    return this.dashboardService.getSummary(req.user.id, req.user.permissions);
  }
}
