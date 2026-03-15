"""
Auto Scheduler - Simple automatic scheduling like Celery Beat
Adds maintenance tasks to queue at regular intervals
"""

import time
import threading
import logging

from services.queue_manager import QueueManager

logger = logging.getLogger(__name__)

class AutoScheduler:
    """Simple scheduler that queues maintenance tasks automatically"""

    def __init__(self):
        self.queue_manager = QueueManager()
        self.running = False
        self.thread = None

        # Track last run times (in seconds since epoch)
        self.last_runs = {
            'refresh': 0,
            'missing_fields': 0,
            'missing_translations': 0,
            'missing_comments': 0,
            'untranslated_comments': 0,
            'untranslated_nicknames': 0,
            'refresh_charts': 0,
            'refresh_booklists': 0,
            'refresh_book_stats': 0,
            'upload_images': 0,
            'booklist_missing_translations': 0,
        }

    def _schedule_if_due(self):
        """Check and schedule tasks if they're due"""
        current_time = time.time()

        # Refresh stale books every 30 minutes
        if current_time - self.last_runs['refresh'] >= 1800:
            try:
                job_id = self.queue_manager.add_maintenance_job('check_stale_books', hours=24, limit=5000)
                logger.info(f"Scheduled refresh task: {job_id}")
                self.last_runs['refresh'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule refresh task: {e}")

        # Missing fields every 60 minutes
        if current_time - self.last_runs['missing_fields'] >= 3600:
            try:
                job_id = self.queue_manager.add_maintenance_job('check_missing_fields', limit=5000)
                logger.info(f"Scheduled missing fields task: {job_id}")
                self.last_runs['missing_fields'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule missing fields task: {e}")

        # Missing translations every 60 minutes
        if current_time - self.last_runs['missing_translations'] >= 3600:
            try:
                job_id = self.queue_manager.add_maintenance_job('check_missing_translations', limit=5000)
                logger.info(f"Scheduled missing translations task: {job_id}")
                self.last_runs['missing_translations'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule missing translations task: {e}")

        # Missing comments every 2 hours
        if current_time - self.last_runs['missing_comments'] >= 7200:
            try:
                job_id = self.queue_manager.add_maintenance_job('check_missing_comments', limit=5000)
                logger.info(f"Scheduled missing comments task: {job_id}")
                self.last_runs['missing_comments'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule missing comments task: {e}")

        # Untranslated comments every 2 hours
        if current_time - self.last_runs['untranslated_comments'] >= 7200:
            try:
                job_id = self.queue_manager.add_maintenance_job('check_untranslated_comments', limit=2000)
                logger.info(f"Scheduled untranslated comments task: {job_id}")
                self.last_runs['untranslated_comments'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule untranslated comments task: {e}")

        # Untranslated nicknames every 2 hours
        if current_time - self.last_runs['untranslated_nicknames'] >= 7200:
            try:
                job_id = self.queue_manager.add_maintenance_job('check_untranslated_nicknames', limit=2000)
                logger.info(f"Scheduled untranslated nicknames task: {job_id}")
                self.last_runs['untranslated_nicknames'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule untranslated nicknames task: {e}")

        # Refresh book stats every 15 minutes
        if current_time - self.last_runs['refresh_book_stats'] >= 900:
            try:
                job_id = self.queue_manager.add_general_job('refresh_book_stats', limit=2000)
                logger.info(f"Scheduled book stats refresh: {job_id}")
                self.last_runs['refresh_book_stats'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule book stats refresh: {e}")

        # Upload images to R2 every 15 minutes
        if current_time - self.last_runs['upload_images'] >= 900:
            try:
                job_id = self.queue_manager.add_general_job('upload_images', limit=5000)
                logger.info(f"Scheduled image upload task: {job_id}")
                self.last_runs['upload_images'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule image upload task: {e}")

        # Refresh booklists every 24 hours
        if current_time - self.last_runs['refresh_booklists'] >= 86400:
            try:
                job_id = self.queue_manager.add_maintenance_job('refresh_qidian_booklists')
                logger.info(f"Scheduled booklist refresh: {job_id}")
                self.last_runs['refresh_booklists'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule booklist refresh: {e}")

        # Booklist missing translations every 2 hours
        if current_time - self.last_runs['booklist_missing_translations'] >= 7200:
            try:
                job_id = self.queue_manager.add_maintenance_job('check_booklist_missing_translations', limit=1000)
                logger.info(f"Scheduled booklist missing translations task: {job_id}")
                self.last_runs['booklist_missing_translations'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule booklist missing translations task: {e}")

        # Refresh QQ charts every 24 hours
        if current_time - self.last_runs['refresh_charts'] >= 86400:
            try:
                job_id = self.queue_manager.add_maintenance_job('refresh_qq_charts')
                logger.info(f"Scheduled QQ charts refresh: {job_id}")
                self.last_runs['refresh_charts'] = current_time
            except Exception as e:
                logger.error(f"Failed to schedule QQ charts refresh: {e}")


    def _run_loop(self):
        """Main scheduling loop"""
        logger.info("🚀 Auto-scheduler started")

        while self.running:
            try:
                self._schedule_if_due()
                # Check every minute
                time.sleep(60)
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                time.sleep(60)

        logger.info("🛑 Auto-scheduler stopped")

    def start(self):
        """Start the scheduler in background"""
        if self.running:
            return

        self.running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        logger.info("✅ Auto-scheduler started in background")

    def stop(self):
        """Stop the scheduler"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
        logger.info("✅ Auto-scheduler stopped")

# Global instance
_scheduler = None

def start_auto_scheduler():
    """Start the global auto scheduler"""
    global _scheduler
    if _scheduler is None:
        _scheduler = AutoScheduler()
    _scheduler.start()

def stop_auto_scheduler():
    """Stop the global auto scheduler"""
    global _scheduler
    if _scheduler:
        _scheduler.stop()