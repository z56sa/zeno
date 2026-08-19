import discord
from discord.ext import commands
import random
import os
# Import the new winner template utility
from utils.winner_template import get_winner_announcement, get_current_date

class GameModules(commands.Cog):
    """
    A collection of modules containing various entertainment games 
    for the Discord bot. All methods are designed to be asynchronous 
    and handle potential discord errors (e.g., missing permissions).
    """
    def __init__(self, bot_client):
        self.bot = bot_client

# --- GAME 2: ROCK PAPER SCISSORS (RPS) ---

@GameModules.command(name="rps")
async def rps_game(self, context: discord.ext.commands.Context):
    """
    Plays a round of Rock, Paper, Scissors against the bot.
    Usage: /rps [move] 
    Handles comparison logic and determines the winner using the new template format.
    """
    opponent_move = random.choice(["rock", "paper", "scissors"])
    # Simplified input retrieval for simulation purposes
    user_input = context.message.content.lower().split()[-1] 

    if user_input not in ["rock", "paper", "scissors"]:
        return await context.send("❌ Please provide a valid move: 'rock', 'paper', or 'scissors'.")

    user_move = user_input
    # Step 1: Announce the round results (temporary embed for flow)
    await context.send(f"🥌 **Your Move:** {user_move.capitalize()} | 🤖 **Bot's Move:** {opponent_move.capitalize()}")

    # --- Core Game Logic ---
    if user_move == opponent_move:
        winner = "It's a tie!"
        score = None
    elif (user_move == "rock" and opponent_move == "scissors") or \
         (user_move == "scissors" and opponent_move == "paper") or \
         (user_move == "paper" and opponent_move == "rock"):
        winner = f"🏆 YOU WIN! {user_move.capitalize()} beats {opponent_move}."
        score = "User"
    else:
        winner = f"😭 BOT WINS! {opponent_move.capitalize()} defeats {user_move}."
        score = "Bot"

    # --- Output Generation (Using new Template) ---
    game_title = "Rock Paper Scissors"
    if winner != "It's a tie!":
        # Only generate the full template if there is a clear victor to simulate the 'Winner Announcement' context.
        winner_name = "User/Bot Placeholder" # In a real scenario, we need who wins definitively for the announcement structure.
        
        # For simulation: assume the winner name reflects the result holder.
        if score == "User":
            final_winner = "You (The Challenger)"
        else:
             final_winner = "The Bot Master"

        result_message = get_winner_announcement(
            winner_name=final_winner, 
            game_title=game_title, 
            score_result=f"Result was {'Victory' if score == 'User' else 'Defeat'}."
        )
        await context.send(result_message) # Send the raw markdown content

    # Note: The original embed logic is replaced by sending the formatted template string.

# --- INITIALIZATION FOR COGS LOADING ---
async def setup(bot_client):
    """Sets up the module by linking it to the main bot client."""
    print("🚀 RPS Game Module loaded successfully.")