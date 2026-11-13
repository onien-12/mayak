"""SQLAlchemy models, one module per aggregate."""

from app.models.ai_review import AiReview
from app.models.area import Area
from app.models.base import Base
from app.models.catalog import Category
from app.models.collection import Collection, CollectionItem
from app.models.enrichment import AppliedSnapshot, ExternalLink, TextCredit
from app.models.event import EventDetails, EventParticipant
from app.models.external_rating import ExternalRatingCache
from app.models.feedback import Comment, Review
from app.models.interest import InterestTag, InterestTagState, UserInterest, UserInterestSettings
from app.models.issue import ImportRun, IssueDetails, OutageBuilding
from app.models.lost_found import LostItem, LostItemPhoto, LostItemReport, LostMatch, LostResponse
from app.models.moderation import Complaint, ModerationCase, ModerationLog
from app.models.note import MapNote, NoteReport
from app.models.notification import Notification
from app.models.photo_metrics import PhotoMetrics
from app.models.place import Favorite, Photo, Place, PlaceHistory
from app.models.quest import Quest, QuestRun, QuestRunMember, QuestStage
from app.models.reputation import ReputationEvent
from app.models.route import Route, RouteSave, RouteStop
from app.models.screening import AuthorStanding, PlaceQuality, QuietHold, StandingEvent
from app.models.user import Respect, Subscription, User
from app.models.verification import Vote

__all__ = [
    "AiReview",
    "AppliedSnapshot",
    "Area",
    "AuthorStanding",
    "Base",
    "Category",
    "Collection",
    "CollectionItem",
    "Comment",
    "Complaint",
    "EventDetails",
    "EventParticipant",
    "ExternalLink",
    "ExternalRatingCache",
    "Favorite",
    "ImportRun",
    "InterestTag",
    "InterestTagState",
    "IssueDetails",
    "LostItem",
    "LostItemPhoto",
    "LostItemReport",
    "LostMatch",
    "LostResponse",
    "MapNote",
    "ModerationCase",
    "ModerationLog",
    "NoteReport",
    "Notification",
    "OutageBuilding",
    "Photo",
    "PhotoMetrics",
    "Place",
    "PlaceHistory",
    "PlaceQuality",
    "Quest",
    "QuestRun",
    "QuestRunMember",
    "QuestStage",
    "QuietHold",
    "ReputationEvent",
    "Respect",
    "Review",
    "Route",
    "RouteSave",
    "RouteStop",
    "StandingEvent",
    "Subscription",
    "TextCredit",
    "User",
    "UserInterest",
    "UserInterestSettings",
    "Vote",
]
