"""
Catalog management commands.
"""

import json
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table
from rich.tree import Tree

from .library import (
    get_library_path,
    load_catalog,
    load_book,
    get_book_entry,
    get_available_languages,
)

console = Console()


@click.group()
def catalog_group():
    """Catalog management commands."""
    pass


@catalog_group.command("list")
@click.option("--tradition", "-t", help="Filter by tradition")
@click.option("--status", "-s", help="Filter by status")
def list_books(tradition: str | None, status: str | None):
    """List all books in the catalog."""
    catalog = load_catalog()

    table = Table(title="Library Catalog")
    table.add_column("#", style="dim", width=3)
    table.add_column("Code", style="cyan", width=8)
    table.add_column("Title", style="white")
    table.add_column("Tradition", style="blue")
    table.add_column("Chapters", justify="right")
    table.add_column("Paras", justify="right")
    table.add_column("Status", style="magenta")

    for i, book in enumerate(catalog.get("books", []), 1):
        if tradition and book.get("tradition") != tradition:
            continue
        if status and book.get("status") != status:
            continue

        status_style = {
            "complete": "green",
            "partial": "yellow",
            "planned": "dim",
            "draft": "cyan",
        }.get(book.get("status", ""), "white")

        table.add_row(
            str(i),
            book.get("code", ""),
            book.get("slug", "")[:35],
            book.get("tradition", ""),
            str(book.get("chapters", 0)),
            str(book.get("paragraphs", 0)),
            f"[{status_style}]{book.get('status', '')}[/{status_style}]",
        )

    console.print(table)

    # Summary
    total = len(catalog.get("books", []))
    complete = sum(1 for b in catalog.get("books", []) if b.get("status") == "complete")
    console.print(f"\n[dim]Total: {total} books ({complete} complete)[/dim]")


@catalog_group.command("tree")
def show_tree():
    """Show catalog as a tree structure."""
    catalog = load_catalog()

    tree = Tree("📚 Library")

    # Group by tradition
    traditions = {}
    for book in catalog.get("books", []):
        trad = book.get("tradition", "unknown")
        if trad not in traditions:
            traditions[trad] = []
        traditions[trad].append(book)

    # Build tree
    for trad_entry in catalog.get("traditions", []):
        trad_id = trad_entry.get("id")
        trad_name = trad_entry.get("name", {}).get("en", trad_id)

        trad_branch = tree.add(f"[blue]{trad_name}[/blue]")

        for book in traditions.get(trad_id, []):
            status_icon = {
                "complete": "✅",
                "partial": "🔶",
                "planned": "📋",
                "draft": "📝",
            }.get(book.get("status", ""), "❓")

            code = book.get("code", "")
            slug = book.get("slug", "")
            trad_branch.add(f"{status_icon} [cyan]{code}[/cyan] {slug}")

    console.print(tree)


@catalog_group.command("info")
@click.argument("book")
def show_info(book: str):
    """Show detailed information about a book."""
    catalog = load_catalog()
    entry = get_book_entry(catalog, book)

    if not entry:
        console.print(f"[red]Book '{book}' not found in catalog[/red]")
        return

    console.print(f"\n[bold cyan]{entry.get('slug')}[/bold cyan]")
    console.print(f"[dim]Code:[/dim] {entry.get('code', 'N/A')}")
    console.print(f"[dim]Original Title:[/dim] {entry.get('originalTitle', 'N/A')}")
    console.print(f"[dim]Author:[/dim] {entry.get('author', 'N/A')}")
    console.print(f"[dim]Year:[/dim] {entry.get('publicationYear', 'N/A')}")
    console.print(f"[dim]Tradition:[/dim] {entry.get('tradition', 'N/A')}")
    console.print(f"[dim]Collection:[/dim] {entry.get('collection', 'N/A')}")
    console.print(f"[dim]Status:[/dim] {entry.get('status', 'N/A')}")
    console.print(f"[dim]Format:[/dim] {entry.get('format', 'single')}")
    console.print(f"[dim]Primary Language:[/dim] {entry.get('primaryLang', 'N/A')}")
    console.print(f"[dim]Available Languages:[/dim] {', '.join(entry.get('availableLangs', []))}")
    console.print(f"[dim]Complete Languages:[/dim] {', '.join(entry.get('completeLangs', []))}")
    console.print(f"[dim]Chapters:[/dim] {entry.get('chapters', 0)}")
    console.print(f"[dim]Paragraphs:[/dim] {entry.get('paragraphs', 0)}")
    console.print(f"[dim]Tags:[/dim] {', '.join(entry.get('tags', []))}")

    # Check if data file exists
    book_data = load_book(book)
    if book_data:
        actual_langs = get_available_languages(book_data)
        console.print(f"\n[dim]Detected languages in data:[/dim] {', '.join(sorted(actual_langs))}")
    else:
        console.print(f"\n[yellow]Warning: No data file found for this book[/yellow]")


@catalog_group.command("validate")
@click.option("--fix", is_flag=True, help="Attempt to fix issues")
def validate(fix: bool):
    """Validate catalog and book data."""
    catalog = load_catalog()
    issues = []

    console.print("[bold]Validating catalog...[/bold]\n")

    for book_entry in catalog.get("books", []):
        slug = book_entry.get("slug", "unknown")
        status = book_entry.get("status", "")

        # For planned books, peek at the data dir: if chapters have actually
        # shipped, promote planned -> partial and fall through to normal
        # validation. If no data file exists, the book is still legitimately
        # planned and we skip it.
        if status == "planned":
            book_data = load_book(slug)
            if not book_data or not book_data.get("chapters"):
                continue
            issues.append(
                f"[yellow]![/yellow] {slug}: status is 'planned' but "
                f"{len(book_data['chapters'])} chapter(s) have shipped"
            )
            if fix:
                book_entry["status"] = "partial"
                status = "partial"
                console.print(f"  [green]Promoted {slug}: planned -> partial[/green]")

        # Check if data exists
        book_data = load_book(slug)
        if not book_data:
            issues.append(f"[red]✗[/red] {slug}: No data file found")
            continue

        # Validate chapter count
        actual_chapters = len(book_data.get("chapters", []))
        expected_chapters = book_entry.get("chapters", 0)
        if actual_chapters != expected_chapters:
            issues.append(
                f"[yellow]![/yellow] {slug}: Chapter count mismatch "
                f"(catalog: {expected_chapters}, actual: {actual_chapters})"
            )
            if fix:
                book_entry["chapters"] = actual_chapters
                console.print(f"  [green]Fixed chapter count[/green]")

        # Validate paragraph count
        actual_paras = sum(
            len(ch.get("paragraphs", []))
            for ch in book_data.get("chapters", [])
        )
        expected_paras = book_entry.get("paragraphs", 0)
        if actual_paras != expected_paras:
            issues.append(
                f"[yellow]![/yellow] {slug}: Paragraph count mismatch "
                f"(catalog: {expected_paras}, actual: {actual_paras})"
            )
            if fix:
                book_entry["paragraphs"] = actual_paras
                console.print(f"  [green]Fixed paragraph count[/green]")

        # Check for missing refIds
        missing_refs = 0
        for chapter in book_data.get("chapters", []):
            for para in chapter.get("paragraphs", []):
                if not para.get("refId"):
                    missing_refs += 1

        if missing_refs > 0:
            issues.append(
                f"[yellow]![/yellow] {slug}: {missing_refs} paragraphs missing refId"
            )

        # Check translations
        detected_langs = get_available_languages(book_data)
        catalog_langs = set(book_entry.get("availableLangs", []))

        if detected_langs != catalog_langs:
            issues.append(
                f"[yellow]![/yellow] {slug}: Language mismatch "
                f"(catalog: {catalog_langs}, detected: {detected_langs})"
            )
            if fix:
                book_entry["availableLangs"] = sorted(detected_langs)
                console.print(f"  [green]Fixed available languages[/green]")

        console.print(f"[green]✓[/green] {slug}")

    if issues:
        console.print(f"\n[bold yellow]Issues found ({len(issues)}):[/bold yellow]")
        for issue in issues:
            console.print(f"  {issue}")

        if fix:
            from .library import save_catalog
            if save_catalog(catalog):
                console.print(f"\n[green]Catalog updated with fixes[/green]")
    else:
        console.print(f"\n[green]✓ All validations passed[/green]")


@catalog_group.command("stats")
def show_stats():
    """Show library statistics."""
    catalog = load_catalog()

    books = catalog.get("books", [])
    total_books = len(books)
    complete = sum(1 for b in books if b.get("status") == "complete")
    partial = sum(1 for b in books if b.get("status") == "partial")
    planned = sum(1 for b in books if b.get("status") == "planned")

    total_chapters = sum(b.get("chapters", 0) for b in books if b.get("status") in ("complete", "partial"))
    total_paras = sum(b.get("paragraphs", 0) for b in books if b.get("status") in ("complete", "partial"))

    all_langs = set()
    for b in books:
        all_langs.update(b.get("availableLangs", []))

    traditions = set(b.get("tradition") for b in books)

    console.print("\n[bold]📚 Library Statistics[/bold]\n")
    console.print(f"Books:        {total_books} total")
    console.print(f"              [green]{complete} complete[/green], [yellow]{partial} partial[/yellow], [dim]{planned} planned[/dim]")
    console.print(f"Chapters:     {total_chapters:,}")
    console.print(f"Paragraphs:   {total_paras:,}")
    console.print(f"Languages:    {len(all_langs)} ({', '.join(sorted(all_langs))})")
    console.print(f"Traditions:   {len(traditions)} ({', '.join(sorted(traditions))})")
