from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select


async def paginate(db: AsyncSession, query: Select, page: int = 1, page_size: int = 20) -> tuple[list, int]:
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Fetch page
    offset = (page - 1) * page_size
    result = await db.execute(query.offset(offset).limit(page_size))
    items = list(result.scalars().all())

    return items, total
