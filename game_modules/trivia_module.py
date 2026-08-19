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

# --- GAME 1: TRIVIA QUIZ ---

@GameModules.command(name="trivia")
async def trivia_game(self, context: discord.ext.commands.Context, difficulty: str = "easy"):
    """
    Starts a fun, multiple-choice trivia quiz.
    Usage: /trivia [difficulty] (e.g., /trivia hard)
    Handles basic user input validation and error checking.
    """
    await context.send("🧠 Welcome to the Trivia Challenge! Please wait for the first question.")
    try:
        # Simulate fetching a question based on difficulty
        question, answers, correct_answer = self._get_random_question(difficulty)
        if not question:
            return await context.send(f"❌ Sorry, I could not find any questions for '{difficulty}' difficulty at this time.")

        await context.send(
            f"📖 **{difficulty.capitalize()} Trivia Question:**\n"
            f"{question}\n\n"
            f"A) {answers[0]}\nB) {answers[1]}\nC) {answers[2]}"
        )
        await context.send("Please reply to this message with the letter of your answer (A, B, or C).")

        # Wait for user response and check if it's a direct reply
        try:
            reply = await context.channel.history(limit=1, before_message_id=context.message.id).get_text("content")
            user_answer = reply.strip().upper()

            if user_answer not in ["A", "B", "C"]:
                return await context.send("⚠️ Invalid input. Please answer only with A, B, or C.")

            # Determine the chosen option and check correctness
            chosen = answers[ord(user_answer) - ord('A')] # Calculate index: A=0, B=1, C=2
            correct_choice = correct_answer

            if chosen.strip().lower() == correct_choice.strip().lower():
                await context.send("🎉 CORRECT! You are a trivia master!")
                # --- WINNER ANNOUNCEMENT INTEGRATION POINT (Successful Win) ---
                winner_announcement = get_winner_announcement(
                    winner_name="You", 
                    game_title="Trivia Challenge", 
                    score_result=f"Correctly answered: {correct_choice}"
                )
                await context.send("\n\n✨ ***VICTORY ANNOUNCEMENT*** ✨\n" + winner_announcement)
            else:
                await context.send(f"😔 INCORRECT. The right answer was {correct_choice}.")

        except Exception as e:
             return await context.send(f"🚨 An error occurred while processing your reply: {type(e).__name__}. Please try again!")


    except discord.errors.Forbidden:
        return await context.send("🛑 I do not have permission to run this game. Please check my bot roles.")
    except Exception as e:
        print(f"Unhandled Trivia Error: {e}")
        await context.send(f"⚠️ An unexpected error occurred during the trivia quiz setup: {type(e).__name__}. Please try again!")


@GameModules.staticmethod
def _get_random_question(difficulty: str) -> tuple[str, list[str], str] | None:
    """Mock function to simulate database/API fetching of a question."""
    if difficulty == "easy":
        return (
            "What is the capital of France?", 
            ["Berlin", "Rome", "Paris"], 
            "Paris"
        )
    elif difficulty == "hard":
        return (
            "Which element has the chemical symbol 'Au'?", 
            ["Silver", "Gold", "Platinum"], 
            "Gold"
        )
    else: # Default or unknown
        return None

# --- INITIALIZATION FOR COGS LOADING ---
async def setup(bot_client):
    """Sets up the module by linking it to the main bot client."""
    print("🚀 Trivia Game Module loaded successfully.")